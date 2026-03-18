[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectId,

  [string]$Region = "africa-south1",
  [string]$TfVarsPath = "terraform-gcp/terraform.tfvars",
  [switch]$ApplyInfrastructure,
  [switch]$SkipKafka,
  [string]$KafkaNamespace = "messaging",
  [string]$KafkaRelease = "kafka",
  [string]$WorkloadsNamespace = "kasi-connect",
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

if (-not (Test-Path $TfVarsPath)) {
  throw "Cannot find tfvars file at $TfVarsPath"
}

Run "terraform" @("-chdir=terraform-gcp", "init")
Run "terraform" @("-chdir=terraform-gcp", "plan", "-var-file=$TfVarsPath")

if (-not $ApplyInfrastructure) {
  Write-Warning "Infrastructure not applied (supply -ApplyInfrastructure to run terraform apply and downstream steps)."
  return
}

Run "terraform" @("-chdir=terraform-gcp", "apply", "-auto-approve", "-var-file=$TfVarsPath")

$outputs = Get-TerraformOutputs
$clusterName = $outputs.gke_cluster_name.value
$clusterRegion = $outputs.gke_cluster_region.value

Run "gcloud" @("container", "clusters", "get-credentials", $clusterName, "--region", $clusterRegion, "--project", $ProjectId)

if (-not $SkipKafka) {
  Run "helm" @("repo", "add", "bitnami", "https://charts.bitnami.com/bitnami")
  Run "helm" @("upgrade", "--install", $KafkaRelease, "bitnami/kafka", "--namespace", $KafkaNamespace, "--create-namespace", "--set", "replicaCount=1", "--set", "zookeeper.enabled=true", "--set", "persistence.enabled=false")
}

Run "kubectl" @("apply", "-f", "k8s/namespace.yaml")
Run "kubectl" @("-n", $WorkloadsNamespace, "apply", "-f", "k8s/backend", "-f", "k8s/frontend")

$dbHost = $outputs.cloud_sql.value.private_ip
$dbUser = $outputs.db_credentials.value.user
$dbPassword = $outputs.db_credentials.value.password
$redisHost = $outputs.redis.value.host
$redisPort = $outputs.redis.value.port
$bucketName = $outputs.asset_bucket.value
$kafkaBroker = "$KafkaRelease.$KafkaNamespace.svc.cluster.local:9092"

$envMap = [ordered]@{
  DB_HOST      = $dbHost
  DB_USER      = $dbUser
  DB_PASSWORD  = $dbPassword
  DATABASE_URL = "postgresql://$dbUser:$dbPassword@$dbHost:5432/kasiconnect"
  REDIS_HOST   = $redisHost
  REDIS_PORT   = "$redisPort"
  KAFKA_BROKERS = $kafkaBroker
  OBS_BUCKET   = $bucketName
}

if ($EnvOutFile) {
  $envMap | ConvertTo-Json | Set-Content -Path $EnvOutFile
}

Write-Host "`nConnection values:`n" -ForegroundColor Green
$envMap.GetEnumerator() | ForEach-Object { Write-Host "$($_.Key)=$($_.Value)" }
