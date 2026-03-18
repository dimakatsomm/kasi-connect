project_id         = "kasi-connect-demo"
region             = "africa-south1"
environment        = "demo"
project_name       = "kasi-connect"
trusted_cidrs      = ["0.0.0.0/0"]
http_ingress_cidrs = ["0.0.0.0/0"]

kubernetes_version = "1.29"
gke_machine_type   = "e2-standard-4"
gke_min_node_count = 2
gke_max_node_count = 4

db_tier                        = "db-custom-2-7680"
db_storage_gb                  = 100
db_enable_deletion_protection  = false

redis_tier           = "STANDARD_HA"
redis_memory_size_gb = 4

bucket_force_destroy = true
