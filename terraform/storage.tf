locals {
  obs_bucket_name = length(trimspace(var.obs_bucket_name)) > 0 ? lower(var.obs_bucket_name) : "${local.resource_prefix}-assets"
}

resource "huaweicloud_obs_bucket" "vendor_assets" {
  bucket        = local.obs_bucket_name
  acl           = "private"
  storage_class = var.obs_storage_class
  force_destroy = var.obs_force_destroy
  tags          = local.tags

  dynamic "website" {
    for_each = var.obs_enable_static_website ? [1] : []
    content {
      index_document = var.obs_index_document
      error_document = var.obs_error_document
    }
  }
}
