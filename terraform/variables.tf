variable "region" {
  description = "Huawei Cloud region (for example af-south-1)."
  type        = string
}

variable "project_id" {
  description = "Optional Huawei Cloud project/tenant ID. Leave null to infer from credentials."
  type        = string
  default     = null
}

variable "access_key" {
  description = "IAM access key (or rely on environment variables)."
  type        = string
  default     = null
  sensitive   = true
}

variable "secret_key" {
  description = "IAM secret key (or rely on environment variables)."
  type        = string
  default     = null
  sensitive   = true
}

variable "project_name" {
  description = "Logical project name used for tagging and resource names."
  type        = string
  default     = "kasi-connect"
}

variable "environment" {
  description = "Deployment environment identifier (dev, staging, prod)."
  type        = string
  default     = "dev"
}

variable "availability_zones" {
  description = "Optional ordered list of availability zones to target. If empty, the provider default for the region is used."
  type        = list(string)
  default     = []
}

variable "vpc_cidr" {
  description = "CIDR for the dedicated VPC."
  type        = string
  default     = "10.10.0.0/16"
}

variable "public_subnet_cidr" {
  description = "CIDR for the public subnet hosting load balancers / NAT."
  type        = string
  default     = "10.10.0.0/24"
}

variable "app_subnet_cidr" {
  description = "CIDR for the private application subnet where CCE workers live."
  type        = string
  default     = "10.10.1.0/24"
}

variable "data_subnet_cidr" {
  description = "CIDR dedicated to stateful managed services (RDS, Redis, Kafka)."
  type        = string
  default     = "10.10.2.0/24"
}

variable "dns_servers" {
  description = "Optional list of custom DNS servers for the subnets."
  type        = list(string)
  default     = []
}

variable "trusted_cidrs" {
  description = "CIDR blocks allowed to reach SSH and internal control-plane ports. Defaults to the VPC CIDR."
  type        = list(string)
  default     = []
}

variable "http_ingress_cidrs" {
  description = "CIDRs allowed to reach HTTP/HTTPS (defaults to 0.0.0.0/0)."
  type        = list(string)
  default     = []
}

variable "ssh_public_key" {
  description = "Public SSH key that will be installed on CCE worker nodes (mandatory)."
  type        = string

  validation {
    condition     = length(trimspace(var.ssh_public_key)) > 0
    error_message = "ssh_public_key cannot be empty."
  }
}

variable "enable_public_api" {
  description = "Allocate an Elastic IP for the CCE API endpoint."
  type        = bool
  default     = false
}

variable "api_bandwidth_size" {
  description = "Size in Mbps for the API Elastic IP bandwidth (if enabled)."
  type        = number
  default     = 5
}

variable "kubernetes_version" {
  description = "CCE cluster version (check region support)."
  type        = string
  default     = "v1.27"
}

variable "cce_cluster_flavor" {
  description = "Cluster control-plane flavor."
  type        = string
  default     = "cce.s2.medium"
}

variable "cce_network_mode" {
  description = "CCE container network type (overlay_l2 or vpc-router)."
  type        = string
  default     = "overlay_l2"
}

variable "cce_service_cidr" {
  description = "Service CIDR allocated within the cluster."
  type        = string
  default     = "172.20.0.0/16"
}

variable "cce_pod_cidr" {
  description = "Pod CIDR allocated within the cluster."
  type        = string
  default     = "172.21.0.0/16"
}

variable "cce_node_flavor" {
  description = "Flavor ID for worker nodes."
  type        = string
  default     = "c6.large.2"
}

variable "cce_node_count" {
  description = "Number of worker nodes to create."
  type        = number
  default     = 2
}

variable "cce_node_root_volume_type" {
  description = "Root volume storage type for worker nodes."
  type        = string
  default     = "SAS"
}

variable "cce_node_root_volume_size" {
  description = "Root volume size in GB."
  type        = number
  default     = 50
}

variable "cce_node_data_volume_type" {
  description = "Data volume storage type for worker nodes."
  type        = string
  default     = "SAS"
}

variable "cce_node_data_volume_size" {
  description = "Data volume size in GB for container workloads."
  type        = number
  default     = 200
}

variable "rds_flavor" {
  description = "GaussDB/PostgreSQL flavor ID."
  type        = string
  default     = "rds.pg.c6.large.2"
}

variable "rds_engine_version" {
  description = "PostgreSQL engine version."
  type        = string
  default     = "15"
}

variable "rds_port" {
  description = "Database port."
  type        = number
  default     = 5432
}

variable "rds_password" {
  description = "Optional database admin password. Randomly generated when empty."
  type        = string
  default     = ""
  sensitive   = true
}

variable "rds_volume_type" {
  description = "Storage type for the database volume."
  type        = string
  default     = "ULTRAHIGH"
}

variable "rds_volume_size" {
  description = "Database volume size in GB."
  type        = number
  default     = 100
}

variable "rds_backup_keep_days" {
  description = "Number of days to retain automated backups."
  type        = number
  default     = 7
}

variable "rds_ha_mode" {
  description = "HA replication mode (async or sync)."
  type        = string
  default     = "async"
}

variable "dcs_engine_version" {
  description = "Redis engine version for DCS."
  type        = string
  default     = "6.0"
}

variable "dcs_capacity_gb" {
  description = "Redis capacity in GB. Must align with the chosen flavor."
  type        = number
  default     = 4
}

variable "dcs_flavor" {
  description = "DCS flavor ID."
  type        = string
  default     = "redis.ha.xu1.large.r2.1"
}

variable "dcs_password" {
  description = "Optional Redis AUTH password (generated if empty)."
  type        = string
  default     = ""
  sensitive   = true
}

variable "dcs_maintain_begin" {
  description = "Maintenance window start (UTC)."
  type        = string
  default     = "02:00:00"
}

variable "dcs_maintain_end" {
  description = "Maintenance window end (UTC)."
  type        = string
  default     = "06:00:00"
}

variable "dms_kafka_engine_version" {
  description = "Kafka engine version for DMS."
  type        = string
  default     = "2.8"
}

variable "dms_flavor_id" {
  description = "DMS Kafka flavor ID."
  type        = string
  default     = "kafka.c3.mini.2"
}

variable "dms_broker_num" {
  description = "Number of Kafka brokers."
  type        = number
  default     = 3
}

variable "dms_storage_spec_code" {
  description = "Storage specification code for Kafka."
  type        = string
  default     = "dms.physical.storage.high"
}

variable "dms_storage_space" {
  description = "Total Kafka storage (GB)."
  type        = number
  default     = 600
}

variable "dms_manager_user" {
  description = "Manager username for Kafka console."
  type        = string
  default     = "kafkamgr"
}

variable "dms_manager_password" {
  description = "Optional Kafka manager password (generated if empty)."
  type        = string
  default     = ""
  sensitive   = true
}

variable "dms_retention_hours" {
  description = "Topic data retention period in hours."
  type        = number
  default     = 72
}

variable "obs_bucket_name" {
  description = "Override OBS bucket name (must be globally unique)."
  type        = string
  default     = ""
}

variable "obs_force_destroy" {
  description = "Allow Terraform to delete non-empty OBS buckets."
  type        = bool
  default     = false
}

variable "obs_storage_class" {
  description = "OBS storage class (STANDARD, WARM, COLD)."
  type        = string
  default     = "STANDARD"
}

variable "obs_enable_static_website" {
  description = "Turn on static website hosting for vendor media."
  type        = bool
  default     = false
}

variable "obs_index_document" {
  description = "Index document name when website hosting is enabled."
  type        = string
  default     = "index.html"
}

variable "obs_error_document" {
  description = "Error document name when website hosting is enabled."
  type        = string
  default     = "error.html"
}

variable "additional_tags" {
  description = "Custom map of extra tags added to every resource."
  type        = map(string)
  default     = {}
}
variable "kafka_topic_partitions" {
  description = "Partition count for the primary Kafka topic."
  type        = number
  default     = 6
}
