resource "huaweicloud_compute_keypair" "cce" {
  name       = "${local.resource_prefix}-workers"
  public_key = trimspace(var.ssh_public_key)
}

resource "huaweicloud_cce_cluster" "main" {
  name                   = "${local.resource_prefix}-cce"
  flavor_id              = var.cce_cluster_flavor
  vpc_id                 = huaweicloud_vpc.main.id
  subnet_id              = huaweicloud_vpc_subnet.this["app"].id
  container_network_type = var.cce_network_mode
  container_network_cidr = var.cce_pod_cidr
  service_network_cidr   = var.cce_service_cidr
  cluster_version        = var.kubernetes_version
  description            = "Primary Kubernetes control plane for KasiConnect"
  authentication_mode    = "rbac"
  eip                    = var.enable_public_api ? huaweicloud_vpc_eip.api[0].address : null
  tags                   = local.tags
}

resource "huaweicloud_cce_node" "workers" {
  for_each          = { for idx in local.node_indexes : tostring(idx) => idx }
  cluster_id        = huaweicloud_cce_cluster.main.id
  name              = format("%s-node-%02d", local.resource_prefix, each.value)
  flavor_id         = var.cce_node_flavor
  key_pair          = huaweicloud_compute_keypair.cce.name
  availability_zone = element(local.resolved_azs, each.value % max(length(local.resolved_azs), 1))
  labels = {
    role = "worker"
  }
  tags = local.tags

  root_volume {
    size       = var.cce_node_root_volume_size
    volumetype = var.cce_node_root_volume_type
  }

  data_volumes {
    size       = var.cce_node_data_volume_size
    volumetype = var.cce_node_data_volume_type
  }
}
