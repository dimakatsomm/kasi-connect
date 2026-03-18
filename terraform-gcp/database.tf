resource "random_password" "db" {
  length           = 20
  special          = true
  override_special = "#@!%^*-_+="
}

locals {
  db_password_effective = length(trimspace(var.db_password)) > 0 ? var.db_password : random_password.db.result
}

resource "google_compute_global_address" "sql_private_ip" {
  name          = "${local.resource_prefix}-sql-range"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.main.id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.main.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.sql_private_ip.name]
}

resource "google_sql_database_instance" "postgres" {
  name             = "${local.resource_prefix}-pg"
  database_version = "POSTGRES_15"
  region           = var.region

  settings {
    tier              = var.db_tier
    disk_size         = var.db_storage_gb
    disk_type         = var.db_disk_type
    availability_type = var.db_availability_type
    activation_policy = "ALWAYS"
    user_labels       = local.labels

    backup_configuration {
      enabled                        = true
      start_time                     = var.db_backup_start_time
      point_in_time_recovery_enabled = true
    }

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.main.id
    }
  }

  deletion_protection = var.db_enable_deletion_protection

  depends_on = [google_service_networking_connection.private_vpc_connection]
}

resource "google_sql_database" "app" {
  name     = var.db_name
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "app" {
  name     = var.db_user
  password = local.db_password_effective
  instance = google_sql_database_instance.postgres.name
}
