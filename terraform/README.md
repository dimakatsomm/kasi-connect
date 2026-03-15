# Huawei Cloud Terraform Stack

This module provisions the core KasiConnect platform primitives on Huawei Cloud using Terraform. It codifies networking, compute, and data plane services so staging/production regions can be spun up consistently.

## What Gets Created
- **Networking** – single VPC (/16) plus public, application, and data subnets, shared security group, and optional Elastic IP for the CCE API server.
- **Compute** – Huawei Cloud Container Engine (CCE) cluster with configurable node pool backed by your SSH key pair.
- **Data plane** – GaussDB (PostgreSQL) RDS instance, DCS (Redis) cache, DMS Kafka instance with the `<prefix>-orders` topic managed in Terraform.
- **Object storage** – OBS bucket for vendor media with optional static website hosting for CDN-style delivery.

## Prerequisites
1. **Terraform 1.6+** installed locally (or use Terraform Cloud).
2. **Huawei Cloud credentials** with permissions for VPC, CCE, RDS, DCS, DMS, and OBS. Export as environment variables or set the `access_key` / `secret_key` variables:
   ```powershell
   $env:HUAWEICLOUD_ACCESS_KEY="..."
   $env:HUAWEICLOUD_SECRET_KEY="..."
   $env:HUAWEICLOUD_REGION="af-south-1"
   ```
3. **Services enabled** in the target region (CCE, DCS, DMS, GaussDB/Relational Database Service, OBS).
4. **SSH public key** you are comfortable installing on every worker node (pass via `ssh_public_key`).

## Directory Layout
| File | Purpose |
| --- | --- |
| `main.tf` | Provider definition, shared locals, AZ discovery. |
| `variables.tf` | Input variables and sane defaults. |
| `network.tf` | VPC, subnets, security groups, API Elastic IP. |
| `cce.tf` | CCE cluster plus worker nodes + key pair. |
| `database.tf` | GaussDB/PostgreSQL instance including backup policy. |
| `cache.tf` | Redis (DCS) instance with optional password overrides. |
| `messaging.tf` | DMS Kafka instance and the managed `<prefix>-orders` topic. |
| `storage.tf` | OBS bucket (with optional static website hosting). |
| `outputs.tf` | Connection metadata surfaced after `terraform apply`. |
| `terraform.tfvars.example` | Starter values you can copy into your own tfvars file. |

## Usage
1. Copy the example tfvars and adjust for the target environment:
   ```bash
   cd terraform
   cp terraform.tfvars.example terraform.tfvars
   # edit the file and plug in secrets / CIDRs / sizes
   ```
2. (Optional) Override sensitive values via environment variables instead of committing them. Terraform automatically picks up `HUAWEICLOUD_*` variables.
3. Initialize providers and download plugins:
   ```bash
   terraform init
   ```
4. Review the plan:
   ```bash
   terraform plan -var-file=terraform.tfvars
   ```
5. Apply the infrastructure:
   ```bash
   terraform apply -var-file=terraform.tfvars
   ```
6. Pull kubeconfig for the new cluster so workloads can be deployed (requires `huaweicloud` CLI):
   ```bash
   huaweicloud cce cluster kubeconfig get --cluster $(terraform output -raw cce_cluster_id) --dir ~/.kube
   ```
7. Fetch other connection details via outputs:
   ```bash
   terraform output database_private_endpoints
   terraform output redis_instance_id
   terraform output kafka_instance_id
   ```

## Operations Tips
- **Scaling nodes** – adjust `cce_node_count` (and optionally `cce_node_flavor`) then re-apply.
- **Credentials** – leave the password variables empty to auto-generate values with `random_password`; Terraform state will contain the generated secrets, so store it securely (e.g., in a remote backend with encryption).
- **Network hardening** – tighten `trusted_cidrs` and `http_ingress_cidrs` for production to allow only bastion/VPN ranges.
- **Static assets** – turn on `obs_enable_static_website` when you want OBS to serve the vendor dashboard assets or marketing sites directly.

## Destroying
To fully tear down the environment (non-production only!), run:
```bash
terraform destroy -var-file=terraform.tfvars
```
Make sure the OBS bucket is empty unless `obs_force_destroy = true`.
