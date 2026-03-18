locals {
  bucket_name_effective = length(trimspace(var.bucket_name)) > 0 ? lower(var.bucket_name) : "${local.resource_prefix}-assets"
}

import {
  id = local.bucket_name_effective
  to = google_storage_bucket.assets
}

resource "google_storage_bucket" "assets" {
  name                        = local.bucket_name_effective
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = var.bucket_force_destroy

  labels = local.labels

  depends_on = [google_project_service.storage]
}
