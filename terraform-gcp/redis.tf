resource "google_redis_instance" "cache" {
  name               = "${local.resource_prefix}-redis"
  tier               = var.redis_tier
  memory_size_gb     = var.redis_memory_size_gb
  redis_version      = var.redis_version
  region             = var.region
  authorized_network = google_compute_network.main.id
  display_name       = "KasiConnect session cache"
  transit_encryption_mode = "DISABLED"
  labels                  = local.labels

  maintenance_policy {
    weekly_maintenance_window {
      day = "SUNDAY"
      start_time {
        hours   = 2
        minutes = 0
      }
    }
  }
}
