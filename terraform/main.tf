terraform {
  required_version = ">= 1.6.0"

  required_providers {
    huaweicloud = {
      source  = "huaweicloud/huaweicloud"
      version = ">= 1.64.0"
    }

    random = {
      source  = "hashicorp/random"
      version = ">= 3.5.1"
    }
  }
}

provider "huaweicloud" {
  region     = var.region
  access_key = var.access_key
  secret_key = var.secret_key
  project_id = var.project_id
}

locals {
  resource_prefix = lower(replace("${var.project_name}-${var.environment}", "[^a-z0-9-]", ""))
  tags = merge({
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }, var.additional_tags)
}

data "huaweicloud_availability_zones" "all" {
  count  = length(var.availability_zones) == 0 ? 1 : 0
  region = var.region
}

locals {
  resolved_azs = length(var.availability_zones) > 0 ? var.availability_zones : (
    length(data.huaweicloud_availability_zones.all) > 0 ? data.huaweicloud_availability_zones.all[0].names : []
  )
  primary_az = try(local.resolved_azs[0], null)
  secondary_azs = length(local.resolved_azs) >= 2 ? slice(local.resolved_azs, 0, 2) : (
    local.primary_az != null ? [local.primary_az] : []
  )
  dns_servers        = length(var.dns_servers) > 0 ? var.dns_servers : ["100.125.1.250", "100.125.21.250"]
  trusted_cidrs      = length(var.trusted_cidrs) > 0 ? var.trusted_cidrs : [var.vpc_cidr]
  http_ingress_cidrs = length(var.http_ingress_cidrs) > 0 ? var.http_ingress_cidrs : ["0.0.0.0/0"]
  subnets = {
    public = {
      cidr        = var.public_subnet_cidr
      description = "Ingress + public services"
    }
    app = {
      cidr        = var.app_subnet_cidr
      description = "CCE worker nodes and stateless services"
    }
    data = {
      cidr        = var.data_subnet_cidr
      description = "RDS, Redis, Kafka"
    }
  }
  node_indexes = range(var.cce_node_count)
}
