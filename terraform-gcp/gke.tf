resource "google_service_account" "gke_nodes" {
  account_id   = "${local.resource_prefix}-gke"
  display_name = "${local.resource_prefix}-gke-nodes"
}

resource "google_project_iam_member" "gke_logging" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.gke_nodes.email}"
}

resource "google_project_iam_member" "gke_monitoring" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.gke_nodes.email}"
}

resource "google_project_iam_member" "gke_resource_metadata" {
  project = var.project_id
  role    = "roles/stackdriver.resourceMetadata.writer"
  member  = "serviceAccount:${google_service_account.gke_nodes.email}"
}

resource "google_container_cluster" "primary" {
  name     = "${local.resource_prefix}-gke"
  location = var.region

  remove_default_node_pool = true
  initial_node_count       = 1
  network                  = google_compute_network.main.id
  subnetwork               = google_compute_subnetwork.app.name
  min_master_version       = var.kubernetes_version
  networking_mode          = "VPC_NATIVE"
  resource_labels          = local.labels

  release_channel {
    channel = var.gke_release_channel
  }

  ip_allocation_policy {
    cluster_secondary_range_name  = local.pod_secondary_range_name
    services_secondary_range_name = local.services_secondary_range_name
  }

  dynamic "master_authorized_networks_config" {
    for_each = length(var.trusted_cidrs) > 0 ? [1] : []
    content {
      dynamic "cidr_blocks" {
        for_each = var.trusted_cidrs
        content {
          cidr_block   = cidr_blocks.value
          display_name = "trusted"
        }
      }
    }
  }

  dynamic "private_cluster_config" {
    for_each = var.gke_enable_private_nodes ? [1] : []
    content {
      enable_private_nodes    = true
      enable_private_endpoint = false
      master_ipv4_cidr_block  = var.gke_master_ipv4_cidr
    }
  }

  addons_config {
    http_load_balancing {
      disabled = false
    }
    horizontal_pod_autoscaling {
      disabled = false
    }
  }

  depends_on = [
    google_compute_router_nat.gke,
    google_project_iam_member.gke_logging,
    google_project_iam_member.gke_monitoring,
    google_project_iam_member.gke_resource_metadata
  ]
}

resource "google_container_node_pool" "primary" {
  name     = "${local.resource_prefix}-pool"
  location = var.region
  cluster  = google_container_cluster.primary.name

  autoscaling {
    min_node_count = var.gke_min_node_count
    max_node_count = var.gke_max_node_count
  }

  node_config {
    machine_type = var.gke_machine_type
    disk_size_gb = var.gke_disk_size_gb
    oauth_scopes = [
      "https://www.googleapis.com/auth/devstorage.read_only",
      "https://www.googleapis.com/auth/logging.write",
      "https://www.googleapis.com/auth/monitoring",
      "https://www.googleapis.com/auth/service.management.readonly",
      "https://www.googleapis.com/auth/servicecontrol",
      "https://www.googleapis.com/auth/trace.append"
    ]
    service_account = google_service_account.gke_nodes.email
    labels          = merge(local.labels, { cluster = google_container_cluster.primary.name })
    tags            = ["gke-node"]
    metadata = {
      disable-legacy-endpoints = "true"
    }
  }

  management {
    auto_repair  = true
    auto_upgrade = true
  }

  depends_on = [google_container_cluster.primary]
}
