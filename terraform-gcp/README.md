# Google Cloud Terraform Stack

This stack provisions a demo-ready KasiConnect environment on **Google Cloud Platform** so you can showcase the product while waiting for Huawei Cloud approval. It mirrors the Huawei baseline (VPC, Kubernetes, PostgreSQL, Redis, object storage, Kafka) using roughly equivalent GCP services.

## What gets created

| Layer | GCP service | Notes |
| --- | --- | --- |
| Networking | VPC + three custom subnets | `public`, `app`, and `data` tiers plus secondary ranges for pods/services |
| Egress | Cloud Router + Cloud NAT | Lets private GKE nodes reach the internet for image pulls/updates |
| Kubernetes | GKE standard cluster + autoscaled node pool | Regional cluster with Workload Identity-ready node service account |
| Database | Cloud SQL for PostgreSQL 15 | Private IP only, PITR enabled, password generated when omitted |
| Cache | Memorystore for Redis 6.x | Lives inside the data subnet so pods can talk to it over private IP |
| Storage | Cloud Storage bucket | Stores vendor media / static assets (replacement for OBS) |
| Messaging | **Manual add-on** | Install Kafka/Redpanda via Helm on the GKE cluster after provisioning |

## Prerequisites

1. **Terraform 1.6+**
2. **gcloud SDK** with Application Default Credentials:
   ```powershell
   gcloud auth application-default login
   ```
3. **APIs enabled** on the target project (once per project):
   ```bash
   gcloud services enable compute.googleapis.com container.googleapis.com \
     sqladmin.googleapis.com servicenetworking.googleapis.com \
     redis.googleapis.com storage.googleapis.com
   ```
4. (Optional) **Artifact Registry** repository to host your container images: `gcloud artifacts repositories create kasiconnect --repository-format=docker --location=africa-south1`.

## Usage

```bash
cd terraform-gcp
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars with your project id, CIDRs, sizing, etc.
terraform init
terraform plan -var-file=terraform.tfvars
terraform apply -var-file=terraform.tfvars
```

Key outputs:
- `cloud_sql.private_ip` � plug into `DB_HOST` for in-cluster connectivity.
- `cloud_sql.connection_name` � use with Cloud SQL Auth Proxy when running tools locally.
- `db_credentials` (sensitive) � Terraform prints it once; store it in Secret Manager/Kubernetes secrets.
- `redis.host`/`port` � feed into `REDIS_HOST` + `REDIS_PORT`.
- `asset_bucket` � becomes `OBS_BUCKET` replacement for media uploads.

## Post-provision steps

1. **Fetch kubeconfig**
   ```bash
   gcloud container clusters get-credentials "$(terraform output -raw gke_cluster_name)" \
     --region "$(terraform output -raw gke_cluster_region)" \
     --project "$GOOGLE_CLOUD_PROJECT"
   ```
2. **Install Kafka for the demo** (single-replica Bitnami chart works well):
   ```bash
   helm repo add bitnami https://charts.bitnami.com/bitnami
   helm install kafka bitnami/kafka \
     --namespace messaging --create-namespace \
     --set replicaCount=1 --set zookeeper.enabled=true \
     --set persistence.enabled=false
   # Broker endpoint inside the cluster:
   # kafka.messaging.svc.cluster.local:9092
   ```
   Update `backend` secrets with `KAFKA_BROKERS=kafka.messaging.svc.cluster.local:9092`.
3. **Create Kubernetes secrets/configmaps** for the backend/front-end manifests in `k8s/`. Suggested values:

   | Env var | Value source |
   | --- | --- |
   | `DB_HOST` | `terraform output -json cloud_sql | jq -r '.value.private_ip'` |
   | `DB_USER`/`DB_PASSWORD` | `db_credentials` output |
   | `DATABASE_URL` | `postgresql://DB_USER:DB_PASSWORD@DB_HOST:5432/kasiconnect` |
   | `REDIS_HOST` / `REDIS_PORT` | Memorystore output |
   | `OBS_BUCKET` | `asset_bucket` (use Google Cloud Storage SDK/gsutil) |
   | `OBS_ENDPOINT` | Leave empty on GCP |
   | `KAFKA_BROKERS` | `kafka.messaging.svc.cluster.local:9092` |

4. **Deploy the workloads**
   ```bash
   kubectl apply -f k8s/namespace.yaml
   kubectl -n kasi-connect apply -f k8s/backend -f k8s/frontend
   ```

5. **Expose the frontend**: Create a GKE HTTP(S) Load Balancer via Ingress (add a simple `Ingress` manifest in `k8s/frontend`). For demos you can also use `kubectl port-forward` or Cloud Run as a frontend host.

## Clean up

To avoid lingering costs, tear everything down when the demo finishes:
```bash
terraform destroy -var-file=terraform.tfvars
```
Remember to uninstall the Kafka Helm release and delete any Artifact Registry images if you pushed new builds.

## Automation helper

Use `scripts/setup-gcp-demo.ps1` to run the full flow (plan/apply, pull kubeconfig, install the single-node Kafka chart, and apply the existing Kubernetes manifests). Example:

```powershell
pwsh scripts/setup-gcp-demo.ps1 -ProjectId your-gcp-project -ApplyInfrastructure -EnvOutFile scripts/gcp-demo-env.json
```

The script prints the DB/Redis/Kafka/GCS values you need for backend secrets and can optionally write them to a JSON file for `kubectl create secret`.

## GitHub Actions (Terraform + Deployment)

This repository now includes GCP-specific workflows:

- `.github/workflows/terraform-gcp.yml` provisions `terraform-gcp/` for `develop` (staging) and `main` (production).
- `.github/workflows/deploy-gcp.yml` deploys backend/frontend to GKE after a successful Terraform run, or via manual dispatch.

Set these GitHub secrets (preferably in `staging` and `production` environments):

- `GCP_PROJECT_ID`
- `GCP_REGION` (for example `africa-south1`)
- `GCP_SA_KEY_JSON` (service account key JSON with Terraform + GKE + Artifact Registry permissions)
- `TF_STATE_BUCKET_GCP` (GCS bucket for Terraform remote state)
- `TF_STATE_PREFIX_GCP` (optional, defaults to `kasi-connect` in workflow)
- `GAR_REPOSITORY` (Artifact Registry Docker repository name)
- `GKE_CLUSTER_NAME_STAGING`
- `GKE_CLUSTER_NAME_PRODUCTION`

Application deploy workflow also uses the existing runtime secrets (`DB_*`, `DATABASE_URL`, `REDIS_*`, `KAFKA_BROKERS`, WhatsApp/Twilio, `OBS_BUCKET`). `NEXT_PUBLIC_API_URL` is auto-discovered from the backend LoadBalancer IP at deploy time.
