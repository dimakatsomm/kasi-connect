resource "google_compute_network" "main" {
  name                    = "${local.resource_prefix}-vpc"
  auto_create_subnetworks = false
  description             = "KasiConnect demo network"
  routing_mode            = "REGIONAL"
}

resource "google_compute_subnetwork" "public" {
  name                     = "${local.resource_prefix}-public"
  ip_cidr_range            = var.public_subnet_cidr
  region                   = var.region
  network                  = google_compute_network.main.id
  description              = local.subnets["public"].description
  private_ip_google_access = true
}

resource "google_compute_subnetwork" "app" {
  name                     = "${local.resource_prefix}-app"
  ip_cidr_range            = var.app_subnet_cidr
  region                   = var.region
  network                  = google_compute_network.main.id
  description              = local.subnets["app"].description
  private_ip_google_access = true

  secondary_ip_range {
    range_name    = local.pod_secondary_range_name
    ip_cidr_range = var.pod_cidr
  }

  secondary_ip_range {
    range_name    = local.services_secondary_range_name
    ip_cidr_range = var.service_cidr
  }
}

resource "google_compute_subnetwork" "data" {
  name                     = "${local.resource_prefix}-data"
  ip_cidr_range            = var.data_subnet_cidr
  region                   = var.region
  network                  = google_compute_network.main.id
  description              = local.subnets["data"].description
  private_ip_google_access = true
}

resource "google_compute_firewall" "allow_http_https" {
  name    = "${local.resource_prefix}-allow-http"
  network = google_compute_network.main.name

  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }

  source_ranges = var.http_ingress_cidrs
  direction     = "INGRESS"
}

resource "google_compute_firewall" "allow_internal" {
  name    = "${local.resource_prefix}-allow-internal"
  network = google_compute_network.main.name

  allow {
    protocol = "all"
  }

  source_ranges = [
    var.public_subnet_cidr,
    var.app_subnet_cidr,
    var.data_subnet_cidr,
    var.pod_cidr,
    var.service_cidr
  ]
  direction = "INGRESS"
}

resource "google_compute_router" "main" {
  name    = "${local.resource_prefix}-router"
  network = google_compute_network.main.id
  region  = var.region
}

resource "google_compute_router_nat" "gke" {
  name                                = "${local.resource_prefix}-nat"
  router                              = google_compute_router.main.name
  region                              = var.region
  nat_ip_allocate_option              = "AUTO_ONLY"
  min_ports_per_vm                    = var.nat_min_ports_per_vm
  enable_endpoint_independent_mapping = true

  subnetwork {
    name                    = google_compute_subnetwork.app.name
    source_ip_ranges_to_nat = ["ALL_IP_RANGES"]
  }

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}
