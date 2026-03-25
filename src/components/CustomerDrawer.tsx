import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import BottomDrawer from './BottomDrawer';
import { useTheme } from '../theme/ThemeProvider';
import customerService from '../services/customerService';
import deliverySettingService, {
  DeliverySettingRecord,
} from '../services/deliverySettingService';
import { Customer, CustomerAddress, CustomerUpsertPayload } from '../types/customer';
import {
  formatCustomerAddress,
  getCustomerDisplayName,
} from '../utils/customerData';
import { useSettings } from '../hooks/useSettings';

type CustomerDrawerProps = {
  visible: boolean;
  selectedCustomer?: Customer | null;
  onClose: () => void;
  onSelect: (customer: Customer | null) => Promise<void> | void;
};

type CustomerFormAddress = CustomerAddress & {
  localKey: string;
};

type CustomerFormState = {
  firstName: string;
  lastName: string;
  mobileNo: string;
  email: string;
  isDebitor: boolean;
  customerCompanyName: string;
  steuerId: string;
  addresses: CustomerFormAddress[];
  selectedAddressKey: string | null;
};

type DeliverySettingOption = DeliverySettingRecord;

const createLocalKey = () =>
  `customer_address_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const toTrimmedString = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const toNumber = (value: unknown, fallback: number | null = null): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
};

const createEmptyAddress = (): CustomerFormAddress => ({
  localKey: createLocalKey(),
  addressLine1: '',
  landmark: '',
  city: '',
  pincode: '',
  isDeleted: false,
  deliverySettingId: null,
  minimumOrderValue: null,
  deliveryCharge: null,
});

const inferPrefillFromSearch = (search: string) => {
  const trimmed = search.trim();
  if (!trimmed) {
    return {
      firstName: '',
      lastName: '',
      mobileNo: '',
      email: '',
    };
  }

  if (trimmed.includes('@')) {
    return {
      firstName: '',
      lastName: '',
      mobileNo: '',
      email: trimmed,
    };
  }

  if (/^[+\d\s()-]+$/.test(trimmed)) {
    return {
      firstName: '',
      lastName: '',
      mobileNo: trimmed.replace(/\s+/g, ''),
      email: '',
    };
  }

  const [firstName = '', ...rest] = trimmed.split(/\s+/);
  return {
    firstName,
    lastName: rest.join(' '),
    mobileNo: '',
    email: '',
  };
};

const createFormState = (
  customer?: Customer | null,
  searchPrefill = '',
): CustomerFormState => {
  if (!customer) {
    const inferred = inferPrefillFromSearch(searchPrefill);
    const address = createEmptyAddress();
    return {
      firstName: inferred.firstName,
      lastName: inferred.lastName,
      mobileNo: inferred.mobileNo,
      email: inferred.email,
      isDebitor: false,
      customerCompanyName: '',
      steuerId: '',
      addresses: [address],
      selectedAddressKey: address.localKey,
    };
  }

  const activeAddresses = customer.addresses
    .map((address) => ({
      ...address,
      localKey: createLocalKey(),
      isDeleted: address.isDeleted === true,
    }))
    .filter((address) => !address.isDeleted);

  const addresses = activeAddresses.length > 0 ? activeAddresses : [createEmptyAddress()];
  const selectedAddress =
    addresses.find((address) => address.id === customer.customerAddressId) || addresses[0];

  return {
    firstName: customer.firstName || '',
    lastName: customer.lastName || '',
    mobileNo: customer.mobileNo || '',
    email: customer.email || '',
    isDebitor: customer.isDebitor === true,
    customerCompanyName: customer.customerCompanyName || '',
    steuerId: customer.steuerId || '',
    addresses,
    selectedAddressKey: selectedAddress?.localKey || addresses[0]?.localKey || null,
  };
};

const normalizeDeliverySettings = (settings: any): DeliverySettingOption[] => {
  const rawList = Array.isArray(settings?.deliverySettingDetails)
    ? settings.deliverySettingDetails
    : Array.isArray((settings as any)?.settingInfo?.deliverySettingDetails)
      ? (settings as any).settingInfo.deliverySettingDetails
      : [];

  return rawList
    .map((item: any) => {
      const pincode = toTrimmedString(
        item?.pincode ?? item?.pinCode ?? item?.zipCode ?? item?.deliveryAreaPinCode,
      );
      const city = toTrimmedString(item?.city ?? item?.name ?? item?.deliveryAreaName);
      if (!pincode && !city) return null;
      return {
        id: item?.id ?? item?._id ?? null,
        pincode,
        city,
        minimumOrderValue: toNumber(item?.minimumOrderValue),
        deliveryCharge: toNumber(item?.deliveryCharge),
      };
    })
    .filter((item: DeliverySettingOption | null): item is DeliverySettingOption => Boolean(item));
};

const styles = StyleSheet.create({
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
});

export default function CustomerDrawer({
  visible,
  selectedCustomer,
  onClose,
  onSelect,
}: CustomerDrawerProps) {
  const { colors } = useTheme();
  const { settings } = useSettings();
  const [mode, setMode] = useState<'list' | 'form'>('list');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDeliverySettings, setLoadingDeliverySettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerFormState>(() => createFormState());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [focusedPincodeKey, setFocusedPincodeKey] = useState<string | null>(null);
  const [liveDeliverySettings, setLiveDeliverySettings] = useState<
    DeliverySettingOption[]
  >([]);

  const deliverySettings = useMemo(
    () =>
      liveDeliverySettings.length > 0
        ? liveDeliverySettings
        : normalizeDeliverySettings(settings),
    [liveDeliverySettings, settings],
  );

  useEffect(() => {
    if (!visible) {
      setMode('list');
      setEditingCustomer(null);
      setErrors({});
      setSearchQuery('');
      setFocusedPincodeKey(null);
      setLiveDeliverySettings([]);
      return;
    }

    if (mode !== 'list') {
      return;
    }

    let isActive = true;
    const timer = setTimeout(async () => {
      try {
        setLoadingList(true);
        const list = await customerService.listCustomers({
          searchStr: searchQuery,
          limit: 200,
        });
        if (isActive) {
          setCustomers(list);
        }
      } catch (error) {
        if (isActive) {
          setCustomers([]);
        }
        console.error('CustomerDrawer: Failed to load customers', error);
      } finally {
        if (isActive) {
          setLoadingList(false);
        }
      }
    }, 260);

    return () => {
      isActive = false;
      clearTimeout(timer);
    };
  }, [mode, visible, searchQuery]);

  useEffect(() => {
    if (!visible || mode !== 'form') {
      return;
    }

    let isActive = true;

    const loadDeliverySettings = async () => {
      try {
        setLoadingDeliverySettings(true);
        const list = await deliverySettingService.listDeliverySettings();
        if (isActive) {
          setLiveDeliverySettings(list);
        }
      } catch (error) {
        console.error('CustomerDrawer: Failed to load delivery settings', error);
      } finally {
        if (isActive) {
          setLoadingDeliverySettings(false);
        }
      }
    };

    loadDeliverySettings();

    return () => {
      isActive = false;
    };
  }, [mode, visible]);

  const selectedCustomerMatches = (customer: Customer) => {
    if (!selectedCustomer) return false;
    if (selectedCustomer.id != null && customer.id != null) {
      return selectedCustomer.id === customer.id;
    }
    return selectedCustomer.mobileNo === customer.mobileNo;
  };

  const activeAddresses = useMemo(
    () => form.addresses.filter((address) => !address.isDeleted),
    [form.addresses],
  );

  const updateForm = (patch: Partial<CustomerFormState>) => {
    setForm((current) => ({ ...current, ...patch }));
  };

  const updateAddress = (
    localKey: string,
    patch: Partial<CustomerFormAddress>,
  ) => {
    setForm((current) => ({
      ...current,
      addresses: current.addresses.map((address) =>
        address.localKey === localKey ? { ...address, ...patch } : address,
      ),
    }));
  };

  const openAddMode = () => {
    setEditingCustomer(null);
    setErrors({});
    setForm(createFormState(null, searchQuery));
    setMode('form');
  };

  const openEditMode = (customer: Customer) => {
    setEditingCustomer(customer);
    setErrors({});
    setForm(createFormState(customer));
    setMode('form');
  };

  const handleSelectCustomer = async (customer: Customer | null) => {
    await onSelect(customer);
    onClose();
  };

  const handleBackToList = () => {
    setMode('list');
    setEditingCustomer(null);
    setErrors({});
  };

  const addAddress = () => {
    const nextAddress = createEmptyAddress();
    setForm((current) => ({
      ...current,
      addresses: [...current.addresses, nextAddress],
      selectedAddressKey: current.selectedAddressKey || nextAddress.localKey,
    }));
  };

  const removeAddress = (localKey: string) => {
    setForm((current) => {
      const target = current.addresses.find((address) => address.localKey === localKey);
      const nextAddresses =
        target?.id != null
          ? current.addresses.map((address) =>
              address.localKey === localKey ? { ...address, isDeleted: true } : address,
            )
          : current.addresses.filter((address) => address.localKey !== localKey);

      const nextActiveAddresses = nextAddresses.filter((address) => !address.isDeleted);
      return {
        ...current,
        addresses: nextAddresses,
        selectedAddressKey:
          current.selectedAddressKey === localKey
            ? nextActiveAddresses[0]?.localKey || null
            : current.selectedAddressKey,
      };
    });
  };

  const getDeliverySettingMatches = (address: CustomerFormAddress) => {
    const pincodeQuery = address.pincode.trim().toLowerCase();
    const cityQuery = address.city.trim().toLowerCase();
    if (!pincodeQuery && !cityQuery) {
      return focusedPincodeKey === address.localKey
        ? deliverySettings.slice(0, 12)
        : [];
    }

    return deliverySettings
      .filter((item) => {
        const pin = item.pincode.toLowerCase();
        const city = item.city.toLowerCase();
        return (
          (!!pincodeQuery && pin.includes(pincodeQuery)) ||
          (!!cityQuery && city.includes(cityQuery))
        );
      })
      .slice(0, 5);
  };

  const applyDeliverySetting = (
    localKey: string,
    deliverySetting: DeliverySettingOption,
  ) => {
    updateAddress(localKey, {
      pincode: deliverySetting.pincode,
      city: deliverySetting.city,
      deliverySettingId: deliverySetting.id,
      minimumOrderValue: deliverySetting.minimumOrderValue,
      deliveryCharge: deliverySetting.deliveryCharge,
    });
    setFocusedPincodeKey(null);
  };

  const handlePincodeChange = (localKey: string, value: string) => {
    const normalizedValue = value.trim().toLowerCase();
    const exactMatch = deliverySettings.find(
      (item) => item.pincode.trim().toLowerCase() === normalizedValue,
    );

    if (exactMatch) {
      applyDeliverySetting(localKey, exactMatch);
      return;
    }

    updateAddress(localKey, {
      pincode: value,
      city: '',
      deliverySettingId: null,
      minimumOrderValue: null,
      deliveryCharge: null,
    });
  };

  const validateForm = () => {
    const nextErrors: Record<string, string> = {};

    if (!form.firstName.trim()) {
      nextErrors.firstName = 'First name is required.';
    }

    if (!form.mobileNo.trim()) {
      nextErrors.mobileNo = 'Mobile number is required.';
    }

    if (form.isDebitor && !form.customerCompanyName.trim()) {
      nextErrors.customerCompanyName = 'Company name is required for debitor.';
    }

    const visibleAddresses = form.addresses.filter((address) => !address.isDeleted);
    if (!visibleAddresses.length) {
      nextErrors.addresses = 'At least one address is required.';
    }

    visibleAddresses.forEach((address) => {
      if (!address.addressLine1.trim()) {
        nextErrors[`addressLine1-${address.localKey}`] = 'Address is required.';
      }
      if (!address.city.trim()) {
        nextErrors[`city-${address.localKey}`] = 'City is required.';
      }
      if (!address.pincode.trim()) {
        nextErrors[`pincode-${address.localKey}`] = 'Pincode is required.';
      }
    });

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    const selectedAddress =
      form.addresses.find(
        (address) =>
          address.localKey === form.selectedAddressKey && address.isDeleted !== true,
      ) ||
      activeAddresses[0] ||
      null;

    const payload: CustomerUpsertPayload = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      mobileNo: form.mobileNo.trim(),
      email: form.email.trim(),
      isDebitor: form.isDebitor,
      customerCompanyName: form.customerCompanyName.trim(),
      steuerId: form.steuerId.trim(),
      addresses: form.addresses.map(({ localKey, ...address }) => ({
        ...address,
        addressLine1: address.addressLine1.trim(),
        landmark: address.landmark?.trim() || '',
        city: address.city.trim(),
        pincode: address.pincode.trim(),
      })),
    };

    try {
      setSaving(true);
      const savedCustomer = editingCustomer?.id != null
        ? await customerService.updateCustomer(editingCustomer.id, payload)
        : await customerService.createCustomer(payload);

      const fallbackSelectedIndex = activeAddresses.findIndex(
        (address) => address.localKey === selectedAddress?.localKey,
      );
      const nextSelectedAddress =
        (savedCustomer.addresses || []).find(
          (address) =>
            selectedAddress?.id != null && address.id === selectedAddress.id,
        ) ||
        (fallbackSelectedIndex >= 0
          ? savedCustomer.addresses?.[fallbackSelectedIndex]
          : null) ||
        savedCustomer.addresses?.[0] ||
        null;

      await handleSelectCustomer({
        ...savedCustomer,
        customerAddressId:
          nextSelectedAddress?.id ??
          savedCustomer.customerAddressId ??
          null,
      });
    } catch (error) {
      console.error('CustomerDrawer: Failed to save customer', error);
      setErrors((current) => ({
        ...current,
        form: 'Unable to save customer right now.',
      }));
    } finally {
      setSaving(false);
    }
  };

  const renderField = ({
    label,
    value,
    onChangeText,
    placeholder,
    error,
    keyboardType,
    editable = true,
    multiline = false,
    onFocus,
  }: {
    label: string;
    value: string;
    onChangeText: (value: string) => void;
    placeholder: string;
    error?: string;
    keyboardType?: 'default' | 'email-address' | 'number-pad' | 'phone-pad';
    editable?: boolean;
    multiline?: boolean;
    onFocus?: () => void;
  }) => (
    <View style={{ marginBottom: 14 }}>
      <Text style={[styles.fieldLabel, { color: colors.text }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        keyboardType={keyboardType}
        editable={editable}
        multiline={multiline}
        onFocus={onFocus}
        style={{
          minHeight: multiline ? 88 : 48,
          borderWidth: 1,
          borderColor: error ? colors.error || '#f26e73' : colors.border,
          borderRadius: 14,
          backgroundColor: editable ? colors.surface : colors.surfaceHover || colors.background,
          color: colors.text,
          paddingHorizontal: 14,
          paddingVertical: multiline ? 12 : 10,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
      {error ? (
        <Text style={{ color: colors.error || '#f26e73', fontSize: 11, marginTop: 6 }}>
          {error}
        </Text>
      ) : null}
    </View>
  );

  const footer =
    mode === 'list' ? (
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {selectedCustomer ? (
          <TouchableOpacity
            onPress={() => handleSelectCustomer(null)}
            style={{
              flex: 1,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              minHeight: 48,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: colors.text, fontWeight: '700' }}>Clear Customer</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          onPress={onClose}
          style={{
            flex: selectedCustomer ? 1 : 2,
            borderRadius: 14,
            backgroundColor: colors.primary,
            minHeight: 48,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: colors.textInverse || '#fff', fontWeight: '800' }}>Done</Text>
        </TouchableOpacity>
      </View>
    ) : (
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <TouchableOpacity
          onPress={handleBackToList}
          disabled={saving}
          style={{
            flex: 1,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            minHeight: 48,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: saving ? 0.6 : 1,
          }}
        >
          <Text style={{ color: colors.text, fontWeight: '700' }}>Back</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          style={{
            flex: 1.2,
            borderRadius: 14,
            backgroundColor: colors.primary,
            minHeight: 48,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: saving ? 0.8 : 1,
          }}
        >
          {saving ? (
            <ActivityIndicator color={colors.textInverse || '#fff'} />
          ) : (
            <Text style={{ color: colors.textInverse || '#fff', fontWeight: '800' }}>
              {editingCustomer ? 'Update Customer' : 'Add Customer'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    );

  return (
    <BottomDrawer
      visible={visible}
      onClose={onClose}
      title={mode === 'list' ? 'Customer' : editingCustomer ? 'Edit Customer' : 'Add Customer'}
      subtitle={
        mode === 'list'
          ? 'Search, select, or create a customer for this order.'
          : 'Use the same customer details and address rules as POS.'
      }
      fullHeight
      maxHeightRatio={0.98}
      footer={footer}
    >
      {mode === 'list' ? (
        <View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: 14,
              gap: 10,
            }}
          >
            <View
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 14,
                backgroundColor: colors.surface,
                minHeight: 48,
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 12,
              }}
            >
              <MaterialIcons name="search" size={18} color={colors.textSecondary} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search customers"
                placeholderTextColor={colors.textSecondary}
                style={{
                  flex: 1,
                  marginLeft: 8,
                  color: colors.text,
                  paddingVertical: 10,
                }}
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <MaterialIcons name="close" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              ) : null}
            </View>

            <TouchableOpacity
              onPress={openAddMode}
              style={{
                borderRadius: 14,
                backgroundColor: colors.primary,
                minHeight: 48,
                paddingHorizontal: 16,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MaterialIcons name="person-add-alt-1" size={18} color={colors.textInverse || '#fff'} />
              <Text
                style={{
                  color: colors.textInverse || '#fff',
                  fontWeight: '800',
                  marginLeft: 6,
                }}
              >
                Add New
              </Text>
            </TouchableOpacity>
          </View>

          {selectedCustomer ? (
            <View
              style={{
                borderWidth: 1,
                borderColor: colors.primary,
                backgroundColor: colors.surfaceHover || colors.background,
                borderRadius: 16,
                padding: 14,
                marginBottom: 14,
              }}
            >
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: 11,
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  letterSpacing: 0.8,
                }}
              >
                Selected For Order
              </Text>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 6 }}>
                {getCustomerDisplayName(selectedCustomer) || selectedCustomer.mobileNo}
              </Text>
              {selectedCustomer.mobileNo ? (
                <Text style={{ color: colors.textSecondary, marginTop: 4 }}>
                  {selectedCustomer.mobileNo}
                </Text>
              ) : null}
              {formatCustomerAddress(
                selectedCustomer.addresses.find(
                  (address) => address.id === selectedCustomer.customerAddressId,
                ) || selectedCustomer.addresses[0],
              ) ? (
                <Text style={{ color: colors.textSecondary, marginTop: 4, lineHeight: 18 }}>
                  {formatCustomerAddress(
                    selectedCustomer.addresses.find(
                      (address) => address.id === selectedCustomer.customerAddressId,
                    ) || selectedCustomer.addresses[0],
                  )}
                </Text>
              ) : null}
            </View>
          ) : null}

          {loadingList ? (
            <View style={{ paddingVertical: 42, alignItems: 'center' }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : customers.length === 0 ? (
            <View
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                borderRadius: 16,
                padding: 20,
                alignItems: 'center',
              }}
            >
              <MaterialCommunityIcons
                name="account-search-outline"
                size={28}
                color={colors.textSecondary}
              />
              <Text style={{ color: colors.text, fontWeight: '700', marginTop: 10 }}>
                No customers found
              </Text>
              <Text
                style={{
                  color: colors.textSecondary,
                  marginTop: 4,
                  textAlign: 'center',
                  lineHeight: 18,
                }}
              >
                Try a different search or add a new customer.
              </Text>
            </View>
          ) : (
            customers.map((customer) => {
              const selected = selectedCustomerMatches(customer);
              const addressText = formatCustomerAddress(
                customer.addresses.find(
                  (address) => address.id === customer.customerAddressId,
                ) || customer.addresses[0],
              );

              return (
                <Pressable
                  key={`${customer.id ?? customer.mobileNo ?? Math.random()}`}
                  onPress={() => handleSelectCustomer(customer)}
                  style={{
                    borderWidth: 1,
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected
                      ? colors.surfaceHover || colors.background
                      : colors.surface,
                    borderRadius: 16,
                    padding: 14,
                    marginBottom: 12,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1, paddingRight: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <MaterialCommunityIcons
                          name={selected ? 'account-check-outline' : 'account-outline'}
                          size={18}
                          color={selected ? colors.primary : colors.textSecondary}
                        />
                        <Text
                          style={{
                            color: colors.text,
                            fontWeight: '800',
                            fontSize: 15,
                            marginLeft: 8,
                          }}
                        >
                          {getCustomerDisplayName(customer) || 'Unnamed Customer'}
                        </Text>
                      </View>

                      {customer.mobileNo ? (
                        <Text style={{ color: colors.textSecondary, marginTop: 8 }}>
                          {customer.mobileNo}
                        </Text>
                      ) : null}

                      {addressText ? (
                        <Text
                          style={{
                            color: colors.textSecondary,
                            marginTop: 6,
                            lineHeight: 18,
                          }}
                        >
                          {addressText}
                        </Text>
                      ) : null}
                    </View>

                    <TouchableOpacity
                      onPress={(event) => {
                        event.stopPropagation?.();
                        openEditMode(customer);
                      }}
                      style={{
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.surfaceHover || colors.background,
                        paddingHorizontal: 12,
                        paddingVertical: 9,
                        flexDirection: 'row',
                        alignItems: 'center',
                      }}
                    >
                      <MaterialCommunityIcons
                        name="pencil-outline"
                        size={15}
                        color={colors.text}
                      />
                      <Text style={{ color: colors.text, fontWeight: '700', marginLeft: 6 }}>
                        Edit
                      </Text>
                    </TouchableOpacity>
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
      ) : (
        <View>
          {renderField({
            label: 'First Name',
            value: form.firstName,
            onChangeText: (value) => updateForm({ firstName: value }),
            placeholder: 'Enter first name',
            error: errors.firstName,
          })}

          {renderField({
            label: 'Last Name',
            value: form.lastName,
            onChangeText: (value) => updateForm({ lastName: value }),
            placeholder: 'Enter last name',
          })}

          {renderField({
            label: 'Mobile Number',
            value: form.mobileNo,
            onChangeText: (value) => updateForm({ mobileNo: value }),
            placeholder: 'Enter mobile number',
            keyboardType: 'phone-pad',
            editable: !editingCustomer,
            error: errors.mobileNo,
          })}

          {editingCustomer ? (
            <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: -8, marginBottom: 14 }}>
              Mobile number stays locked in edit mode, matching POS behavior.
            </Text>
          ) : null}

          {renderField({
            label: 'Email',
            value: form.email,
            onChangeText: (value) => updateForm({ email: value }),
            placeholder: 'Enter email address',
            keyboardType: 'email-address',
          })}

          <View
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              borderRadius: 16,
              padding: 14,
              marginBottom: 14,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={[styles.fieldLabel, { color: colors.text, marginBottom: 4 }]}>
                  Debitor Customer
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18 }}>
                  Require company details when this customer is marked as debitor.
                </Text>
              </View>
              <Switch
                value={form.isDebitor}
                onValueChange={(value) => updateForm({ isDebitor: value })}
                trackColor={{
                  true: `${colors.primary}66`,
                  false: colors.border,
                }}
                thumbColor={form.isDebitor ? colors.primary : colors.surface}
              />
            </View>
          </View>

          {form.isDebitor ? (
            <>
              {renderField({
                label: 'Company Name',
                value: form.customerCompanyName,
                onChangeText: (value) => updateForm({ customerCompanyName: value }),
                placeholder: 'Enter company name',
                error: errors.customerCompanyName,
              })}

              {renderField({
                label: 'Steuer ID',
                value: form.steuerId,
                onChangeText: (value) => updateForm({ steuerId: value }),
                placeholder: 'Enter steuer ID',
              })}
            </>
          ) : null}

          <View style={{ marginTop: 4, marginBottom: 8 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 10,
              }}
            >
              <View>
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>
                  Addresses
                </Text>
                <Text style={{ color: colors.textSecondary, marginTop: 4, fontSize: 12 }}>
                  Select the address that should be used for this order.
                </Text>
              </View>

              <TouchableOpacity
                onPress={addAddress}
                style={{
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <MaterialIcons name="add" size={18} color={colors.text} />
                <Text style={{ color: colors.text, fontWeight: '700', marginLeft: 4 }}>
                  Add Address
                </Text>
              </TouchableOpacity>
            </View>

            {errors.addresses ? (
              <Text style={{ color: colors.error || '#f26e73', fontSize: 11, marginBottom: 8 }}>
                {errors.addresses}
              </Text>
            ) : null}

            {activeAddresses.map((address, index) => {
              const isSelected = form.selectedAddressKey === address.localKey;
              const matches = getDeliverySettingMatches(address);
              return (
                <View
                  key={address.localKey}
                  style={{
                    borderWidth: 1,
                    borderColor: isSelected ? colors.primary : colors.border,
                    backgroundColor: colors.surface,
                    borderRadius: 18,
                    padding: 14,
                    marginBottom: 12,
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 12,
                    }}
                  >
                    <TouchableOpacity
                      onPress={() => updateForm({ selectedAddressKey: address.localKey })}
                      style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                    >
                      <MaterialCommunityIcons
                        name={isSelected ? 'radiobox-marked' : 'radiobox-blank'}
                        size={22}
                        color={isSelected ? colors.primary : colors.textSecondary}
                      />
                      <Text
                        style={{
                          color: colors.text,
                          fontWeight: '800',
                          marginLeft: 8,
                        }}
                      >
                        Address {index + 1}
                      </Text>
                    </TouchableOpacity>

                    {activeAddresses.length > 1 ? (
                      <TouchableOpacity
                        onPress={() => removeAddress(address.localKey)}
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: colors.border,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <MaterialCommunityIcons
                          name="trash-can-outline"
                          size={16}
                          color={colors.error || '#f26e73'}
                        />
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  {renderField({
                    label: 'Address',
                    value: address.addressLine1,
                    onChangeText: (value) => updateAddress(address.localKey, { addressLine1: value }),
                    placeholder: 'Street and house number',
                    error: errors[`addressLine1-${address.localKey}`],
                    multiline: true,
                  })}

                  {renderField({
                    label: 'Landmark',
                    value: address.landmark || '',
                    onChangeText: (value) => updateAddress(address.localKey, { landmark: value }),
                    placeholder: 'Optional landmark',
                  })}

                  {renderField({
                    label: 'Pincode',
                    value: address.pincode,
                    onChangeText: (value) => handlePincodeChange(address.localKey, value),
                    placeholder: 'Search or select pincode',
                    keyboardType: 'number-pad',
                    error: errors[`pincode-${address.localKey}`],
                    onFocus: () => setFocusedPincodeKey(address.localKey),
                  })}

                  {loadingDeliverySettings ? (
                    <View style={{ marginTop: -6, marginBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
                      <ActivityIndicator size="small" color={colors.primary} />
                      <Text style={{ color: colors.textSecondary, fontSize: 11, marginLeft: 8 }}>
                        Loading delivery settings...
                      </Text>
                    </View>
                  ) : null}

                  {matches.length > 0 ? (
                    <View style={{ marginTop: -6, marginBottom: 12 }}>
                      <Text style={{ color: colors.textSecondary, fontSize: 11, marginBottom: 8 }}>
                        Select pincode and city
                      </Text>
                      {matches.map((match) => (
                        <TouchableOpacity
                          key={`${match.id ?? `${match.pincode}-${match.city}`}`}
                          onPress={() => applyDeliverySetting(address.localKey, match)}
                          style={{
                            borderWidth: 1,
                            borderColor: colors.border,
                            backgroundColor: colors.surfaceHover || colors.background,
                            borderRadius: 12,
                            paddingHorizontal: 12,
                            paddingVertical: 10,
                            marginBottom: 8,
                          }}
                        >
                          <Text style={{ color: colors.text, fontWeight: '700' }}>
                            {match.pincode} {match.city ? `- ${match.city}` : ''}
                          </Text>
                          {(match.minimumOrderValue != null || match.deliveryCharge != null) ? (
                            <Text style={{ color: colors.textSecondary, marginTop: 4, fontSize: 12 }}>
                              {match.minimumOrderValue != null
                                ? `Min ${match.minimumOrderValue}`
                                : 'Min n/a'}
                              {'  '}
                              {match.deliveryCharge != null
                                ? `Charge ${match.deliveryCharge}`
                                : 'Charge n/a'}
                            </Text>
                          ) : null}
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}

                  {renderField({
                    label: 'City',
                    value: address.city,
                    onChangeText: () => undefined,
                    placeholder: 'Auto-filled from pincode',
                    error: errors[`city-${address.localKey}`],
                    editable: false,
                  })}

                  {(address.minimumOrderValue != null || address.deliveryCharge != null) ? (
                    <View
                      style={{
                        borderRadius: 14,
                        backgroundColor: colors.surfaceHover || colors.background,
                        padding: 12,
                        marginTop: -2,
                      }}
                    >
                      <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18 }}>
                        {address.minimumOrderValue != null
                          ? `Minimum order: ${address.minimumOrderValue}`
                          : 'Minimum order: n/a'}
                        {'\n'}
                        {address.deliveryCharge != null
                          ? `Delivery charge: ${address.deliveryCharge}`
                          : 'Delivery charge: n/a'}
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>

          {errors.form ? (
            <Text style={{ color: colors.error || '#f26e73', fontSize: 12, marginTop: 6 }}>
              {errors.form}
            </Text>
          ) : null}
        </View>
      )}
    </BottomDrawer>
  );
}
