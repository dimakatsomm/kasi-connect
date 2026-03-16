resource "huaweicloud_vpc" "main" {
  name        = "${local.resource_prefix}-vpc"
  cidr        = var.vpc_cidr
  description = "KasiConnect multi-tier network"
  tags        = local.tags
}

resource "huaweicloud_vpc_subnet" "this" {
  for_each      = local.subnets
  name          = "${local.resource_prefix}-${each.key}"
  description   = each.value.description
  vpc_id        = huaweicloud_vpc.main.id
  cidr          = each.value.cidr
  gateway_ip    = cidrhost(each.value.cidr, 1)
  primary_dns   = length(local.dns_servers) > 0 ? local.dns_servers[0] : null
  secondary_dns = length(local.dns_servers) > 1 ? local.dns_servers[1] : null
  tags          = local.tags
}

resource "huaweicloud_vpc_eip" "api" {
  count = var.enable_public_api ? 1 : 0

  publicip {
    type = "5_bgp"
  }

  bandwidth {
    name        = "${local.resource_prefix}-api"
    size        = var.api_bandwidth_size
    share_type  = "PER"
    charge_mode = "traffic"
  }

  tags = local.tags
}

resource "huaweicloud_networking_secgroup" "platform" {
  name        = "${local.resource_prefix}-sg"
  description = "Shared security group for KasiConnect services"
  tags        = local.tags
}

resource "huaweicloud_networking_secgroup_rule" "ssh_admin" {
  for_each          = toset(local.trusted_cidrs)
  security_group_id = huaweicloud_networking_secgroup.platform.id
  direction         = "ingress"
  ethertype         = "IPv4"
  protocol          = "tcp"
  port_range_min    = 22
  port_range_max    = 22
  remote_ip_prefix  = each.key
}

resource "huaweicloud_networking_secgroup_rule" "https_public" {
  for_each          = toset(local.http_ingress_cidrs)
  security_group_id = huaweicloud_networking_secgroup.platform.id
  direction         = "ingress"
  ethertype         = "IPv4"
  protocol          = "tcp"
  port_range_min    = 443
  port_range_max    = 443
  remote_ip_prefix  = each.key
}

resource "huaweicloud_networking_secgroup_rule" "http_public" {
  for_each          = toset(local.http_ingress_cidrs)
  security_group_id = huaweicloud_networking_secgroup.platform.id
  direction         = "ingress"
  ethertype         = "IPv4"
  protocol          = "tcp"
  port_range_min    = 80
  port_range_max    = 80
  remote_ip_prefix  = each.key
}

resource "huaweicloud_networking_secgroup_rule" "internal_full" {
  security_group_id = huaweicloud_networking_secgroup.platform.id
  direction         = "ingress"
  ethertype         = "IPv4"
  remote_ip_prefix  = var.vpc_cidr
}

# When using vpc-router network mode the pod CIDR may fall outside the VPC
# CIDR, so we need an extra rule to allow pod-to-data-plane traffic.
resource "huaweicloud_networking_secgroup_rule" "internal_pod_cidr" {
  count             = var.cce_network_mode == "vpc-router" ? 1 : 0
  security_group_id = huaweicloud_networking_secgroup.platform.id
  direction         = "ingress"
  ethertype         = "IPv4"
  remote_ip_prefix  = var.cce_pod_cidr
}

resource "huaweicloud_networking_secgroup_rule" "egress_all" {
  security_group_id = huaweicloud_networking_secgroup.platform.id
  direction         = "egress"
  ethertype         = "IPv4"
  remote_ip_prefix  = "0.0.0.0/0"
}

# ── NAT gateway for CCE worker egress ─────────────────────────────────────────
# CCE workers live in the private app subnet and need internet egress to pull
# container images and receive OS/package updates. The NAT gateway sits in the
# public subnet and routes outbound traffic through an Elastic IP.

resource "huaweicloud_vpc_eip" "nat" {
  publicip {
    type = "5_bgp"
  }

  bandwidth {
    name        = "${local.resource_prefix}-nat"
    size        = var.nat_bandwidth_size
    share_type  = "PER"
    charge_mode = "traffic"
  }

  tags = local.tags
}

resource "huaweicloud_nat_gateway" "main" {
  name      = "${local.resource_prefix}-nat"
  spec      = "1"
  vpc_id    = huaweicloud_vpc.main.id
  subnet_id = huaweicloud_vpc_subnet.this["public"].id
  tags      = local.tags
}

resource "huaweicloud_nat_snat_rule" "app_egress" {
  nat_gateway_id = huaweicloud_nat_gateway.main.id
  subnet_id      = huaweicloud_vpc_subnet.this["app"].id
  floating_ip_id = huaweicloud_vpc_eip.nat.id
}
