import { Customer, CustomerAddress } from '../types/customer';

const toTrimmedString = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

export const normalizeCustomerAddress = (raw: any): CustomerAddress => ({
  id: raw?.id ?? raw?._id ?? null,
  addressLine1: toTrimmedString(raw?.addressLine1),
  landmark: toTrimmedString(raw?.landmark),
  city: toTrimmedString(raw?.city),
  pincode: toTrimmedString(raw?.pincode ?? raw?.zipCode),
  isDeleted: raw?.isDeleted === true,
  deliverySettingId: raw?.deliverySettingId ?? null,
  minimumOrderValue:
    raw?.minimumOrderValue != null ? Number(raw.minimumOrderValue) : null,
  deliveryCharge:
    raw?.deliveryCharge != null ? Number(raw.deliveryCharge) : null,
});

export const normalizeCustomer = (raw: any): Customer | null => {
  if (!raw) return null;

  const source = raw?.dataValues ?? raw?.user ?? raw?.customer ?? raw;
  const addressData: any[] = Array.isArray(raw?.addressData)
    ? raw.addressData
    : Array.isArray(source?.addressData)
      ? source.addressData
      : Array.isArray(source?.addresses)
        ? source.addresses
        : [];

  const addresses = addressData
    .map(normalizeCustomerAddress)
    .filter((address: CustomerAddress) => !address.isDeleted);

  const explicitSelectedAddressId =
    raw?.selectedAddress?.id ??
    source?.selectedAddress?.id ??
    source?.customerAddressId ??
    raw?.customerAddressId ??
    null;

  const customerAddressId =
    explicitSelectedAddressId ??
    addresses.find((address: CustomerAddress) => address.id != null)?.id ??
    null;

  return {
    id: source?.id ?? source?._id ?? null,
    firstName: toTrimmedString(source?.firstName),
    lastName: toTrimmedString(source?.lastName),
    mobileNo: toTrimmedString(source?.mobileNo),
    email: toTrimmedString(source?.email),
    isDebitor: source?.isDebitor === true,
    steuerId: toTrimmedString(source?.steuerId),
    customerCompanyName: toTrimmedString(source?.customerCompanyName),
    addresses,
    customerAddressId,
    isCallerId: source?.isCallerId === true,
  };
};

export const buildCustomerFromOrderDetails = (orderDetails: any): Customer | null => {
  if (!orderDetails) return null;

  const hasCustomerData =
    orderDetails?.customerId != null ||
    toTrimmedString(orderDetails?.userFirstName) !== '' ||
    toTrimmedString(orderDetails?.userMobile) !== '' ||
    (Array.isArray(orderDetails?.addresses) && orderDetails.addresses.length > 0);

  if (!hasCustomerData) {
    return null;
  }

  return normalizeCustomer({
    id: orderDetails?.customerId ?? null,
    firstName: orderDetails?.userFirstName ?? '',
    lastName: orderDetails?.userLastName ?? '',
    mobileNo: orderDetails?.userMobile ?? '',
    email: orderDetails?.userEmail ?? '',
    addresses: orderDetails?.addresses || [],
    customerAddressId: orderDetails?.customerAddressId ?? null,
    customerCompanyName: orderDetails?.customerCompanyName ?? '',
    steuerId: orderDetails?.steuerId ?? '',
    isDebitor: orderDetails?.isDebitor === true,
    isCallerId: orderDetails?.isCallerId === true,
  });
};

export const buildPosOrderCustomerFields = (customer?: Customer | null) => {
  const normalized = normalizeCustomer(customer);

  return {
    customerId: normalized?.id ?? null,
    userEmail: normalized?.email || '',
    userFirstName: normalized?.firstName || '',
    userLastName: normalized?.lastName || '',
    userMobile: normalized?.mobileNo || null,
    addresses: normalized?.addresses || [],
    isCallerId: normalized?.isCallerId === true,
    customerCompanyName: normalized?.customerCompanyName || '',
    steuerId: normalized?.steuerId || '',
    isDebitor: normalized?.isDebitor === true,
    customerAddressId: normalized?.customerAddressId ?? null,
  };
};

export const buildPosOrderCustomer = (customer?: Customer | null) => {
  const normalized = normalizeCustomer(customer);
  if (!normalized) return null;

  return {
    id: normalized.id ?? null,
    email: normalized.email || '',
    firstName: normalized.firstName || '',
    lastName: normalized.lastName || '',
    mobileNo: normalized.mobileNo || '',
    addresses: normalized.addresses || [],
    customerCompanyName: normalized.customerCompanyName || '',
    steuerId: normalized.steuerId || '',
    isDebitor: normalized.isDebitor === true,
    customerAddressId: normalized.customerAddressId ?? null,
    isCallerId: normalized.isCallerId === true,
  };
};

export const buildPosPrintCurrentUser = (customer?: Customer | null) => {
  const normalized = normalizeCustomer(customer);
  if (!normalized) return null;

  return {
    customerId: normalized.id ?? null,
    email: normalized.email || '',
    firstName: normalized.firstName || '',
    lastName: normalized.lastName || '',
    mobileNo: normalized.mobileNo || '',
    addresses: normalized.addresses || [],
    customerCompanyName: normalized.customerCompanyName || '',
    steuerId: normalized.steuerId || '',
    isDebitor: normalized.isDebitor === true,
  };
};

export const resolveOrderCustomer = (
  orderInfo?: any,
  customer?: Customer | null,
): Customer | null => {
  const explicitCustomer = normalizeCustomer(customer);
  if (explicitCustomer) {
    return explicitCustomer;
  }

  const orderCustomer = normalizeCustomer(orderInfo?.customer);
  if (orderCustomer) {
    return orderCustomer;
  }

  return buildCustomerFromOrderDetails(orderInfo);
};

export const mergeOrderCustomerData = (
  orderInfo: any,
  customer?: Customer | null,
): any => {
  if (!orderInfo) return orderInfo;

  const resolvedCustomer = resolveOrderCustomer(orderInfo, customer);
  if (!resolvedCustomer) {
    return orderInfo;
  }

  return {
    ...orderInfo,
    ...buildPosOrderCustomerFields(resolvedCustomer),
    customer: buildPosOrderCustomer(resolvedCustomer),
  };
};

export const getSelectedCustomerAddress = (
  customer?: Customer | null,
): CustomerAddress | null => {
  if (!customer) return null;

  const selected = customer.addresses.find(
    (address) => address.id != null && address.id === customer.customerAddressId,
  );

  return selected || customer.addresses[0] || null;
};

export const formatCustomerAddress = (
  address?: CustomerAddress | null,
): string => {
  if (!address) return '';

  return [
    toTrimmedString(address.addressLine1),
    toTrimmedString(address.landmark),
    toTrimmedString(address.city),
    toTrimmedString(address.pincode),
  ]
    .filter(Boolean)
    .join(', ');
};

export const getCustomerDisplayName = (customer?: Customer | null): string => {
  if (!customer) return '';
  return [toTrimmedString(customer.firstName), toTrimmedString(customer.lastName)]
    .filter(Boolean)
    .join(' ');
};
