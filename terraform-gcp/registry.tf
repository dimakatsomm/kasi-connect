# Artifact Registry Docker repository and CI/CD service account.

resource "google_artifact_registry_repository" "images" {
  location      = var.region
  repository_id = local.resource_prefix
  description   = "Docker image registry for ${local.resource_prefix}"
  format        = "DOCKER"
  labels        = local.labels

  depends_on = [google_project_service.artifactregistry]
}

# Allow GKE node service account to pull images (avoids short-lived imagePullSecret expiry).
resource "google_artifact_registry_repository_iam_member" "gke_nodes_reader" {
  location   = google_artifact_registry_repository.images.location
  repository = google_artifact_registry_repository.images.repository_id
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${google_service_account.gke_nodes.email}"
}

# ---------------------------------------------------------------------------
# CI/CD service account used by GitHub Actions to push images and deploy.
# ---------------------------------------------------------------------------
resource "google_service_account" "cicd" {
  account_id   = "${local.resource_prefix}-cicd"
  display_name = "${local.resource_prefix}-cicd"
  description  = "Used by GitHub Actions to push Docker images and roll out to GKE."

  depends_on = [google_project_service.iam]
}

resource "google_project_iam_member" "cicd_gar_writer" {
  project = var.project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.cicd.email}"
}

resource "google_project_iam_member" "cicd_gke_developer" {
  project = var.project_id
  role    = "roles/container.developer"
  member  = "serviceAccount:${google_service_account.cicd.email}"
}

resource "google_service_account_key" "cicd" {
  service_account_id = google_service_account.cicd.name
}
