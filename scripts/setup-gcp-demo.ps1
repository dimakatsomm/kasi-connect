[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectId,

  [string]$Region = "africa-south1",
  [string]$TfVarsPath = "terraform-gcp/terraform.tfvars",
  [switch]$ApplyInfrastructure,
  [switch]$SkipKafka,
  [switch]$SkipBuild,
  [string]$ImageTag = "latest",
  [string]$KafkaNamespace = "messaging",
  [string]$KafkaRelease = "kafka",
  [string]$WorkloadsNamespace = "kasi-connect",

  # WhatsApp / Twilio credentials (passed in or prompted)
  [string]$WhatsAppProvider = "twilio",
  [string]$TwilioAccountSid,
  [string]$TwilioAuthToken,
  [string]$TwilioWhatsAppFrom = "14155238886",
  [string]$WhatsAppVerifyToken,
  [string]$WhatsAppAccessToken,
  [string]$WhatsAppPhoneNumberId,

  # JWT secret for vendor dashboard auth
  [string]$JwtSecret,

  [string]$SeedMode = "all",
  [string]$EnvOutFile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Run($cmd, $args) {
  Write-Host "`n>>> $cmd $($args -join ' ')" -ForegroundColor Cyan
  & $cmd @args
  if ($LASTEXITCODE -ne 0) {
    throw "Command '$cmd' failed with exit code $LASTEXITCODE"
  }
}

function Get-TerraformOutputs {
  $json = terraform -chdir=terraform-gcp output -json
  if ($LASTEXITCODE -ne 0) {
    throw "terraform output failed"
  }
  return ($json | Out-String) | ConvertFrom-Json
}

# ── Step 0: Pre-flight checks ──────────────────────────────────────────────
Write-Host "`n=== KasiConnect GCP Demo Deployment ===" -ForegroundColor Green

if (-not (Test-Path $TfVarsPath)) {
  throw "Cannot find tfvars file at $TfVarsPath"
}

foreach ($tool in @("gcloud", "terraform", "kubectl", "docker")) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    throw "Required tool '$tool' is not installed or not on PATH."
  }
}

# Generate a random JWT secret if not supplied
if (-not $JwtSecret) {
  $JwtSecret = -join ((48..57 + 65..90 + 97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })
  Write-Host "Generated random JWT_SECRET for this deployment." -ForegroundColor Yellow
}

# ── Step 1: Terraform ──────────────────────────────────────────────────────
Write-Host "`n=== Step 1: Terraform Infrastructure ===" -ForegroundColor Cyan

Run "terraform" @("-chdir=terraform-gcp", "init")
Run "terraform" @("-chdir=terraform-gcp", "plan", "-var-file=$TfVarsPath")

if (-not $ApplyInfrastructure) {
  Write-Warning "Infrastructure not applied (supply -ApplyInfrastructure to run terraform apply and downstream steps)."
  return
}

Run "terraform" @("-chdir=terraform-gcp", "apply", "-auto-approve", "-var-file=$TfVarsPath")

# ── Step 2: Collect Terraform outputs ──────────────────────────────────────
Write-Host "`n=== Step 2: Collecting Terraform Outputs ===" -ForegroundColor Cyan

$outputs = Get-TerraformOutputs
$clusterName   = $outputs.gke_cluster_name.value
$clusterRegion = $outputs.gke_cluster_region.value
$registryUrl   = $outputs.artifact_registry_url.value
$dbHost        = $outputs.cloud_sql.value.private_ip
$dbUser        = $outputs.db_credentials.value.user
$dbPassword    = $outputs.db_credentials.value.password
$redisHost     = $outputs.redis.value.host
$redisPort     = $outputs.redis.value.port
$bucketName    = $outputs.asset_bucket.value
$kafkaBroker   = "$KafkaRelease.$KafkaNamespace.svc.cluster.local:9092"
$databaseUrl   = "postgresql://$dbUser`:$dbPassword@$dbHost`:5432/kasiconnect?schema=public"

# ── Step 3: GKE credentials ───────────────────────────────────────────────
Write-Host "`n=== Step 3: Fetching GKE Credentials ===" -ForegroundColor Cyan

Run "gcloud" @("container", "clusters", "get-credentials", $clusterName, "--region", $clusterRegion, "--project", $ProjectId)

# ── Step 4: Kafka (Helm) ──────────────────────────────────────────────────
if (-not $SkipKafka) {
  Write-Host "`n=== Step 4: Installing Kafka ===" -ForegroundColor Cyan
  Run "helm" @("repo", "add", "bitnami", "https://charts.bitnami.com/bitnami")
  Run "helm" @("upgrade", "--install", $KafkaRelease, "bitnami/kafka", "--namespace", $KafkaNamespace, "--create-namespace", "--set", "replicaCount=1", "--set", "zookeeper.enabled=true", "--set", "persistence.enabled=false")
} else {
  Write-Host "`n=== Step 4: Skipping Kafka (already installed) ===" -ForegroundColor Yellow
}

# ── Step 5: Build and push Docker images ──────────────────────────────────
$backendImage  = "$registryUrl/backend:$ImageTag"
$frontendImage = "$registryUrl/frontend:$ImageTag"

if (-not $SkipBuild) {
  Write-Host "`n=== Step 5: Building & Pushing Docker Images ===" -ForegroundColor Cyan

  # Configure Docker to authenticate with Artifact Registry
  Run "gcloud" @("auth", "configure-docker", "$Region-docker.pkg.dev", "--quiet")

  # Build backend
  Write-Host "`nBuilding backend image..." -ForegroundColor Yellow
  Run "docker" @("build", "-t", $backendImage, "-f", "backend/Dockerfile", "backend/")
  Run "docker" @("push", $backendImage)

  # The frontend needs the backend LB IP at build time (NEXT_PUBLIC_API_URL).
  # We'll deploy backend first, then wait for its external IP, then build frontend.
  Write-Host "`nBackend image pushed. Frontend build deferred until backend LB IP is available." -ForegroundColor Yellow
} else {
  Write-Host "`n=== Step 5: Skipping Docker Build ===" -ForegroundColor Yellow
}

# ── Step 6: Create K8s namespace and backend-secrets ──────────────────────
Write-Host "`n=== Step 6: Creating Kubernetes Namespace & Secrets ===" -ForegroundColor Cyan

Run "kubectl" @("apply", "-f", "k8s/namespace.yaml")

# Build the secret literals list
$secretArgs = @(
  "-n", $WorkloadsNamespace,
  "create", "secret", "generic", "backend-secrets",
  "--from-literal=DB_HOST=$dbHost",
  "--from-literal=DB_USER=$dbUser",
  "--from-literal=DB_PASSWORD=$dbPassword",
  "--from-literal=DB_PORT=5432",
  "--from-literal=DB_NAME=kasiconnect",
  "--from-literal=DATABASE_URL=$databaseUrl",
  "--from-literal=REDIS_HOST=$redisHost",
  "--from-literal=REDIS_PORT=$redisPort",
  "--from-literal=KAFKA_BROKERS=$kafkaBroker",
  "--from-literal=OBS_BUCKET=$bucketName",
  "--from-literal=JWT_SECRET=$JwtSecret",
  "--from-literal=WHATSAPP_PROVIDER=$WhatsAppProvider"
)

# Add provider-specific WhatsApp vars
if ($WhatsAppProvider -eq "twilio") {
  if ($TwilioAccountSid) { $secretArgs += "--from-literal=TWILIO_ACCOUNT_SID=$TwilioAccountSid" }
  if ($TwilioAuthToken)  { $secretArgs += "--from-literal=TWILIO_AUTH_TOKEN=$TwilioAuthToken" }
  $secretArgs += "--from-literal=TWILIO_WHATSAPP_FROM=$TwilioWhatsAppFrom"
} else {
  if ($WhatsAppVerifyToken)    { $secretArgs += "--from-literal=WHATSAPP_VERIFY_TOKEN=$WhatsAppVerifyToken" }
  if ($WhatsAppAccessToken)    { $secretArgs += "--from-literal=WHATSAPP_ACCESS_TOKEN=$WhatsAppAccessToken" }
  if ($WhatsAppPhoneNumberId)  { $secretArgs += "--from-literal=WHATSAPP_PHONE_NUMBER_ID=$WhatsAppPhoneNumberId" }
}

$secretArgs += "--dry-run=client", "-o", "yaml"

# Use dry-run | apply so it creates or updates the secret idempotently
$secretYaml = & kubectl @secretArgs 2>&1
if ($LASTEXITCODE -ne 0) { throw "kubectl create secret dry-run failed" }
$secretYaml | & kubectl apply -f - 2>&1
if ($LASTEXITCODE -ne 0) { throw "kubectl apply secret failed" }
Write-Host "Secret backend-secrets created/updated." -ForegroundColor Green

# ── Step 7: Deploy backend ────────────────────────────────────────────────
Write-Host "`n=== Step 7: Deploying Backend ===" -ForegroundColor Cyan

# Patch the backend deployment with the real image and seed mode, then apply
$backendDeployYaml = Get-Content "k8s/backend/deployment.yaml" -Raw
$backendDeployYaml = $backendDeployYaml -replace "image: BACKEND_IMAGE", "image: $backendImage"
$backendDeployYaml = $backendDeployYaml -replace "value: app", "value: $SeedMode"
$backendDeployYaml | & kubectl apply -f - 2>&1
if ($LASTEXITCODE -ne 0) { throw "kubectl apply backend deployment failed" }

Run "kubectl" @("-n", $WorkloadsNamespace, "apply", "-f", "k8s/backend/service.yaml")

# ── Step 8: Wait for backend LoadBalancer IP ──────────────────────────────
Write-Host "`n=== Step 8: Waiting for Backend External IP ===" -ForegroundColor Cyan
Write-Host "This may take 1-3 minutes..." -ForegroundColor Yellow

$backendIp = $null
$attempts = 0
$maxAttempts = 30
while (-not $backendIp -and $attempts -lt $maxAttempts) {
  $attempts++
  $backendIp = kubectl -n $WorkloadsNamespace get svc backend -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>$null
  if (-not $backendIp) {
    Start-Sleep -Seconds 10
    Write-Host "  Waiting for external IP... ($attempts/$maxAttempts)" -ForegroundColor Gray
  }
}

if (-not $backendIp) {
  throw "Backend LoadBalancer did not receive an external IP after $maxAttempts attempts."
}

$backendUrl = "http://$backendIp`:3000"
$webhookUrl = "$backendUrl/webhook"
Write-Host "Backend external IP: $backendIp" -ForegroundColor Green
Write-Host "Webhook URL: $webhookUrl" -ForegroundColor Green

# ── Step 9: Build and deploy frontend ─────────────────────────────────────
Write-Host "`n=== Step 9: Building & Deploying Frontend ===" -ForegroundColor Cyan

if (-not $SkipBuild) {
  Write-Host "Building frontend with NEXT_PUBLIC_API_URL=$backendUrl" -ForegroundColor Yellow
  Run "docker" @("build", "--build-arg", "NEXT_PUBLIC_API_URL=$backendUrl", "-t", $frontendImage, "-f", "frontend/Dockerfile", "frontend/")
  Run "docker" @("push", $frontendImage)
}

$frontendDeployYaml = Get-Content "k8s/frontend/deployment.yaml" -Raw
$frontendDeployYaml = $frontendDeployYaml -replace "image: FRONTEND_IMAGE", "image: $frontendImage"
$frontendDeployYaml | & kubectl apply -f - 2>&1
if ($LASTEXITCODE -ne 0) { throw "kubectl apply frontend deployment failed" }

Run "kubectl" @("-n", $WorkloadsNamespace, "apply", "-f", "k8s/frontend/service.yaml")

# ── Step 10: Wait for frontend LoadBalancer IP ────────────────────────────
Write-Host "`n=== Step 10: Waiting for Frontend External IP ===" -ForegroundColor Cyan

$frontendIp = $null
$attempts = 0
while (-not $frontendIp -and $attempts -lt $maxAttempts) {
  $attempts++
  $frontendIp = kubectl -n $WorkloadsNamespace get svc frontend -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>$null
  if (-not $frontendIp) {
    Start-Sleep -Seconds 10
    Write-Host "  Waiting for external IP... ($attempts/$maxAttempts)" -ForegroundColor Gray
  }
}

if (-not $frontendIp) {
  Write-Warning "Frontend LoadBalancer did not receive an external IP yet. Check with: kubectl -n $WorkloadsNamespace get svc frontend"
  $frontendUrl = "(pending)"
} else {
  $frontendUrl = "http://$frontendIp`:4000"
}

# ── Step 11: Output summary ──────────────────────────────────────────────
$envMap = [ordered]@{
  DB_HOST            = $dbHost
  DB_USER            = $dbUser
  DB_PASSWORD        = $dbPassword
  DATABASE_URL       = $databaseUrl
  REDIS_HOST         = $redisHost
  REDIS_PORT         = "$redisPort"
  KAFKA_BROKERS      = $kafkaBroker
  OBS_BUCKET         = $bucketName
  WHATSAPP_PROVIDER  = $WhatsAppProvider
  JWT_SECRET         = $JwtSecret
  BACKEND_IMAGE      = $backendImage
  FRONTEND_IMAGE     = $frontendImage
  BACKEND_URL        = $backendUrl
  FRONTEND_URL       = $frontendUrl
  WEBHOOK_URL        = $webhookUrl
}

if ($EnvOutFile) {
  $envMap | ConvertTo-Json | Set-Content -Path $EnvOutFile
  Write-Host "`nCredentials written to $EnvOutFile" -ForegroundColor Yellow
}

Write-Host "`n" -NoNewline
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║             KasiConnect GCP Demo — Deployed!               ║" -ForegroundColor Green
Write-Host "╠══════════════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║                                                            ║" -ForegroundColor Green
Write-Host "║  Backend API:   $($backendUrl.PadRight(37))║" -ForegroundColor Green
Write-Host "║  Dashboard:     $($frontendUrl.PadRight(37))║" -ForegroundColor Green
Write-Host "║  Webhook URL:   $($webhookUrl.PadRight(37))║" -ForegroundColor Green
Write-Host "║                                                            ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Green

if ($WhatsAppProvider -eq "twilio") {
  Write-Host "`nTwilio setup:" -ForegroundColor Yellow
  Write-Host "  1. Go to Twilio Console > Messaging > WhatsApp Sandbox Settings"
  Write-Host "  2. Set 'When a message comes in' to: $webhookUrl"
  Write-Host "  3. From your phone, WhatsApp 'join <sandbox-keyword>' to +1 415 523 8886"
  Write-Host "  4. Send a message — it will hit the backend at $backendUrl"
} else {
  Write-Host "`nMeta Cloud API setup:" -ForegroundColor Yellow
  Write-Host "  1. Go to Meta Developer Console > WhatsApp > Configuration"
  Write-Host "  2. Set Webhook URL to: $webhookUrl"
  Write-Host "  3. Verify Token: (the value of WHATSAPP_VERIFY_TOKEN in your secret)"
}

Write-Host "`nVendor Dashboard login:" -ForegroundColor Yellow
Write-Host "  URL:      $frontendUrl"
Write-Host "  Email:    demo@kasiconnect.co.za"
Write-Host "  Phone:    27731234567"
Write-Host "  Password: demo1234"
Write-Host ""
