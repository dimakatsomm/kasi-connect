locals {
  normalized_additional_labels = { for k, v in var.additional_labels : lower(k) => v }
  resource_prefix = lower(replace("${var.project_name}-${var.environment}", "/[^a-z0-9-]/", ""))
  labels = merge({
    project     = lower(var.project_name)
    environment = lower(var.environment)
    managed_by  = "terraform"
  }, local.normalized_additional_labels)

  subnets = {
    public = {
      cidr        = var.public_subnet_cidr
      description = "Ingress + load balancer subnet"
    }
    app = {
      cidr        = var.app_subnet_cidr
      description = "GKE worker nodes and stateless services"
    }
    data = {
      cidr        = var.data_subnet_cidr
      description = "Managed data plane services"
    }
  }

  pod_secondary_range_name      = "${local.resource_prefix}-pods"
  services_secondary_range_name = "${local.resource_prefix}-services"
}
