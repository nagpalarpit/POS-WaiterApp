export interface CustomerAddress {
  id?: number | string | null;
  addressLine1: string;
  landmark?: string;
  city: string;
  pincode: string;
  isDeleted?: boolean;
  deliverySettingId?: number | string | null;
  minimumOrderValue?: number | null;
  deliveryCharge?: number | null;
}

export interface Customer {
  id?: number | string | null;
  firstName: string;
  lastName?: string;
  mobileNo: string;
  email?: string;
  isDebitor?: boolean;
  steuerId?: string;
  customerCompanyName?: string;
  addresses: CustomerAddress[];
  customerAddressId?: number | string | null;
  isCallerId?: boolean;
}

export interface CustomerListParams {
  searchStr?: string;
  limit?: number;
  page?: number;
  isDebitor?: boolean;
}

export interface CustomerUpsertPayload {
  firstName: string;
  lastName?: string;
  mobileNo: string;
  email?: string;
  isDebitor?: boolean;
  steuerId?: string;
  customerCompanyName?: string;
  addresses: CustomerAddress[];
}
