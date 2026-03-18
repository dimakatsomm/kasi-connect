output "network" {
  description = "Primary VPC network name."
  value = {
    name    = google_compute_network.main.name
    project = var.project_id
  }
}

output "subnet_ids" {
  description = "Subnets by tier."
  value = {
    public = google_compute_subnetwork.public.id
    app    = google_compute_subnetwork.app.id
    data   = google_compute_subnetwork.data.id
  }
}

output "gke_cluster" {
  description = "GKE cluster metadata."
  value = {
    name     = google_container_cluster.primary.name
    location = google_container_cluster.primary.location
    endpoint = google_container_cluster.primary.endpoint
  }
}

output "node_pool" {
  description = "Node pool resource ID."
  value       = google_container_node_pool.primary.id
}

output "cloud_sql" {
  description = "Cloud SQL connection settings."
  value = {
    connection_name = google_sql_database_instance.postgres.connection_name
    private_ip      = google_sql_database_instance.postgres.private_ip_address
    database        = google_sql_database.app.name
    user            = google_sql_user.app.name
  }
}

output "db_credentials" {
  description = "Database username and password."
  value = {
    user     = google_sql_user.app.name
    password = local.db_password_effective
  }
  sensitive = true
}

output "redis" {
  description = "Memorystore connection endpoint."
  value = {
    host = google_redis_instance.cache.host
    port = google_redis_instance.cache.port
  }
}

output "asset_bucket" {
  description = "Cloud Storage bucket holding vendor media."
  value       = google_storage_bucket.assets.name
}
output "gke_cluster_name" {
  description = "Convenience output for cluster credential commands."
  value       = google_container_cluster.primary.name
}

output "gke_cluster_region" {
  description = "Region where the GKE cluster runs."
  value       = google_container_cluster.primary.location
}

output "artifact_registry_repository" {
  description = "GAR repository name — set this as the GAR_REPOSITORY GitHub secret."
  value       = google_artifact_registry_repository.images.repository_id
}

output "cicd_sa_key_json" {
  description = "Base64-encoded JSON key for the CI/CD service account — set as GCP_SA_KEY_JSON GitHub secret."
  value       = google_service_account_key.cicd.private_key
  sensitive   = true
}
