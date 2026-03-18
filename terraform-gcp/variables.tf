variable "project_id" {
  description = "GCP project ID that hosts the demo environment."
  type        = string
}

variable "region" {
  description = "GCP region for all regional resources (for example africa-south1)."
  type        = string
  default     = "africa-south1"
}

variable "project_name" {
  description = "Logical project name used for labels and resource names."
  type        = string
  default     = "kasi-connect"
}

variable "environment" {
  description = "Deployment environment identifier (demo, staging, prod)."
  type        = string
  default     = "demo"
}

variable "public_subnet_cidr" {
  description = "CIDR for the public subnet that fronts load balancers and Cloud NAT."
  type        = string
  default     = "10.20.0.0/24"
}

variable "app_subnet_cidr" {
  description = "CIDR for the private application subnet hosting GKE nodes."
  type        = string
  default     = "10.20.1.0/24"
}

variable "data_subnet_cidr" {
  description = "CIDR for the data subnet used by Cloud SQL and Memorystore."
  type        = string
  default     = "10.20.2.0/24"
}

variable "pod_cidr" {
  description = "Secondary CIDR for Kubernetes pods (must not overlap other ranges)."
  type        = string
  default     = "10.21.0.0/16"
}

variable "service_cidr" {
  description = "Secondary CIDR for Kubernetes services (must not overlap other ranges)."
  type        = string
  default     = "10.22.0.0/20"
}

variable "trusted_cidrs" {
  description = "CIDR blocks that can reach administrative ports (SSH, Kubernetes API)."
  type        = list(string)
  default     = []
}

variable "http_ingress_cidrs" {
  description = "CIDR blocks allowed to reach HTTP/HTTPS load balancers."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "gke_release_channel" {
  description = "GKE release channel (RAPID, REGULAR, STABLE)."
  type        = string
  default     = "REGULAR"
}

variable "gke_machine_type" {
  description = "Machine type for the primary node pool."
  type        = string
  default     = "e2-standard-4"
}

variable "gke_min_node_count" {
  description = "Minimum number of nodes per region in the primary node pool."
  type        = number
  default     = 2
}

variable "gke_max_node_count" {
  description = "Maximum number of nodes per region in the primary node pool."
  type        = number
  default     = 4
}

variable "gke_disk_size_gb" {
  description = "Boot disk size for each node (GB)."
  type        = number
  default     = 100
}

variable "gke_enable_private_nodes" {
  description = "Whether to provision a private GKE control plane (requires Cloud NAT for masters)."
  type        = bool
  default     = false
}
variable "gke_master_ipv4_cidr" {
  description = "/28 CIDR block used for the private GKE control plane when private nodes are enabled."
  type        = string
  default     = "172.16.0.16/28"
}
variable "db_name" {
  description = "Default PostgreSQL database name."
  type        = string
  default     = "kasiconnect"
}

variable "db_user" {
  description = "Application database username."
  type        = string
  default     = "kasiconnect"
}

variable "db_password" {
  description = "Optional PostgreSQL password (random when blank)."
  type        = string
  default     = ""
  sensitive   = true
}

variable "db_tier" {
  description = "Cloud SQL machine tier (for example db-custom-2-7680)."
  type        = string
  default     = "db-custom-2-7680"
}

variable "db_storage_gb" {
  description = "Allocated storage for Cloud SQL (GB)."
  type        = number
  default     = 100
}

variable "db_disk_type" {
  description = "disk type for Cloud SQL (PD_SSD or PD_HDD)."
  type        = string
  default     = "PD_SSD"
}

variable "db_availability_type" {
  description = "Set to ZONAL for demo or REGIONAL for HA."
  type        = string
  default     = "ZONAL"
}

variable "db_backup_start_time" {
  description = "HH:MM (UTC) backup start time."
  type        = string
  default     = "02:00"
}

variable "db_enable_deletion_protection" {
  description = "Protect the Cloud SQL instance from accidental deletion."
  type        = bool
  default     = true
}

variable "redis_tier" {
  description = "Memorystore tier (BASIC or STANDARD_HA)."
  type        = string
  default     = "STANDARD_HA"
}

variable "redis_memory_size_gb" {
  description = "Redis memory size in GB."
  type        = number
  default     = 4
}

variable "redis_version" {
  description = "Redis engine version."
  type        = string
  default     = "REDIS_6_X"
}

variable "bucket_name" {
  description = "Optional override for the Cloud Storage bucket name."
  type        = string
  default     = "kasi-connect-demo-tf"
}

variable "bucket_force_destroy" {
  description = "Allow Terraform to delete non-empty buckets in demo environments."
  type        = bool
  default     = false
}

variable "additional_labels" {
  description = "Extra labels merged into every supported resource."
  type        = map(string)
  default     = {}
}

variable "nat_min_ports_per_vm" {
  description = "Minimum number of ports allocated per VM (Cloud NAT)."
  type        = number
  default     = 256
}

