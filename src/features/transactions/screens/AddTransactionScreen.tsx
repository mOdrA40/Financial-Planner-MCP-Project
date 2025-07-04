import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ActivityIndicator,
  Text,
  StatusBar,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../../../core/navigation/types';
import { useForm, Controller } from 'react-hook-form';
import { Typography, Input, Card, LocationPicker, DatePicker, CategoryPicker, SuperiorDialog } from '../../../core/components';
import { theme } from '../../../core/theme';
import { formatCurrency, formatDate } from '../../../core/utils';
import { Ionicons } from '@expo/vector-icons';
import { useNotificationManager } from '../../../core/hooks';
import { useSuperiorDialog } from '../../../core/hooks';
import { useAppDimensions } from '../../../core/hooks/useAppDimensions';

// Tipe data untuk form transaksi
interface TransactionFormData {
  amount: string;
  type: 'income' | 'expense';
  category: string;
  description: string;
  date: Date;
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  } | null;
}

// Kategori akan diambil dari Supabase
import { supabase } from '../../../config/supabase';
import { createTransaction } from '../../../core/services/supabase/transaction.service';
import { useAuthStore, useTransactionStore } from '../../../core/services/store';

// Tipe untuk kategori
interface Category {
  id: string;
  name: string;
  type: 'income' | 'expense';
  icon?: string;
  color?: string;
}

type AddTransactionScreenRouteProp = RouteProp<RootStackParamList, 'AddTransaction'>;

export const AddTransactionScreen = () => {
  const navigation = useNavigation();
  const route = useRoute<AddTransactionScreenRouteProp>();
  const { user } = useAuthStore();
  const { fetchTransactions } = useTransactionStore();

  // Hook responsif untuk mendapatkan dimensi dan breakpoint
  const {
    responsiveSpacing,
    isSmallDevice,
    isLargeDevice,
    isLandscape
  } = useAppDimensions();

  // Ambil parameter dari route
  const { type: routeType, categoryId: routeCategoryId, budgetId: routeBudgetId } = route.params || {};

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [transactionType, setTransactionType] = useState<'income' | 'expense'>(routeType || 'expense');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const { checkSpecificBudget } = useNotificationManager();
  const { dialogState, showError, showSuccess, hideDialog } = useSuperiorDialog();

  // Responsive header height
  const getHeaderHeight = () => {
    if (isLandscape) return 50;
    if (isSmallDevice) return 56;
    if (isLargeDevice) return 64;
    return 60; // medium device
  };

  // Responsive button sizes
  const getBackButtonSize = () => {
    if (isSmallDevice) return 28;
    if (isLargeDevice) return 36;
    return 32; // medium device
  };

  // Responsive icon sizes
  const getIconSize = () => {
    if (isSmallDevice) return 18;
    if (isLargeDevice) return 24;
    return 20; // medium device
  };

  // Fungsi untuk memuat kategori dari Supabase
  const loadCategories = async () => {
    try {
      setIsLoadingCategories(true);
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;

      if (data) {
        setCategories(data as Category[]);
      }
    } catch (error) {
      // Error loading categories (logging dihapus) 
    } finally {
      setIsLoadingCategories(false);
    }
  };

  // Memuat kategori saat komponen dimount
  React.useEffect(() => {
    loadCategories();
  }, []);

  // Setup status bar dan system UI
  useEffect(() => {
    // Konfigurasi status bar
    StatusBar.setBarStyle('dark-content');
    if (Platform.OS === 'android') {
      StatusBar.setBackgroundColor(theme.colors.white);
      StatusBar.setTranslucent(false);
    }

    // Handle app state changes untuk memastikan system UI tetap konsisten
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'active') {
        // Reset status bar ketika app kembali aktif
        StatusBar.setBarStyle('dark-content');
        if (Platform.OS === 'android') {
          StatusBar.setBackgroundColor(theme.colors.white);
          StatusBar.setTranslucent(false);
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription?.remove();
    };
  }, []);

  // Pastikan status bar dikonfigurasi ulang ketika screen difokuskan
  useFocusEffect(
    React.useCallback(() => {
      StatusBar.setBarStyle('dark-content');
      if (Platform.OS === 'android') {
        StatusBar.setBackgroundColor(theme.colors.white);
        StatusBar.setTranslucent(false);
      }
    }, [])
  );

  // const { getCurrentLocation } = useLocation();

  const { control, handleSubmit, setValue, watch, formState: { errors } } = useForm<TransactionFormData>({
    defaultValues: {
      amount: '',
      type: routeType || 'expense',
      category: routeCategoryId || '',
      description: routeBudgetId ? `Pengeluaran untuk anggaran` : '',
      date: new Date(),
      location: null,
    }
  });

  const selectedDate = watch('date');
  const selectedCategory = watch('category');
  const selectedLocation = watch('location');

  // Fungsi untuk menangani submit form
  const onSubmit = async (data: TransactionFormData) => {
    try {
      setIsSubmitting(true);

      // Validasi user authentication
      if (!user) {
        showError('Error', 'Anda harus login terlebih dahulu');
        return;
      }

      // Konversi amount dari string ke number
      const amount = parseFloat(data.amount.replace(/[^0-9]/g, ''));

      // Validasi amount
      if (isNaN(amount) || amount <= 0) {
        showError('Error', 'Jumlah harus lebih dari 0');
        return;
      }

      // Validasi kategori
      if (!data.category) {
        showError('Error', 'Kategori harus dipilih');
        return;
      }

      // Siapkan data transaksi untuk Supabase
      const transactionData = {
        user_id: user.id,
        category_id: data.category,
        amount: amount,
        description: data.description || '',
        date: data.date.toISOString(),
        type: data.type,
        location_lat: data.location?.latitude || null,
        location_lng: data.location?.longitude || null,
        location_name: data.location?.address || null,
      };

      // Simpan ke Supabase menggunakan service
      await createTransaction(transactionData);

      // Refresh transaction store untuk update data di halaman lain
      if (user) {
        await fetchTransactions(user.id);
      }

      // Setelah transaksi berhasil disimpan, cek budget dan saving goals
      if (data.type === 'expense') {
        // Cek budget alert untuk kategori ini
        await checkSpecificBudget(data.category, amount);
      }

      showSuccess('Sukses', 'Transaksi berhasil disimpan');

      // Navigasi kembali dengan delay yang lebih pendek untuk UX yang lebih baik
      setTimeout(() => {
        // Jika ada budgetId di route params, kembali ke budget detail
        if (routeBudgetId) {
          navigation.goBack();
        } else {
          // Jika tidak, navigasi ke halaman transaksi untuk melihat data terbaru
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (navigation as any).navigate('Main', {
            screen: 'Transactions'
          });
        }
      }, 1500);
    } catch (error) {
      // Error submitting transaction (logging dihapus)
      showError('Error', 'Terjadi kesalahan saat menyimpan transaksi');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Fungsi untuk memformat alamat agar lebih pendek dan readable
  const formatLocationAddress = (address: string): string => {
    if (!address) return '';

    // Split alamat berdasarkan koma
    const parts = address.split(',').map(part => part.trim());

    // Untuk device kecil, format lebih agresif
    if (isSmallDevice && parts.length > 2) {
      // Ambil jalan dan kota/negara saja
      return `${parts[0]}, ${parts[parts.length - 1]}`;
    }

    // Untuk device medium/large, ambil 3 bagian penting
    if (parts.length > 3) {
      // Ambil jalan, area, dan negara
      return `${parts[0]}, ${parts[1]}, ${parts[parts.length - 1]}`;
    }

    return address;
  };

  // Fungsi untuk menangani pemilihan lokasi
  const handleLocationSelect = (location: {
    latitude: number;
    longitude: number;
    address?: string;
  } | null) => {
    setValue('location', location);
    setShowLocationPicker(false);
  };



  // Fungsi untuk menangani perubahan tanggal
  const handleDateChange = (selectedDate: Date) => {
    setShowDatePicker(false);
    setValue('date', selectedDate);
  };

  // Fungsi untuk menangani perubahan tipe transaksi
  const handleTypeChange = (type: 'income' | 'expense') => {
    setTransactionType(type);
    setValue('type', type);
    setValue('category', ''); // Reset kategori saat tipe berubah
  };

  // Fungsi untuk menangani pemilihan kategori
  const handleCategorySelect = (categoryId: string) => {
    setValue('category', categoryId);
    setShowCategoryPicker(false);
  };

  // Mendapatkan nama kategori berdasarkan ID
  const getCategoryName = (categoryId: string) => {
    const category = categories.find(cat => cat.id === categoryId);
    return category ? category.name : '';
  };

  // Render tipe transaksi selector
  const renderTypeSelector = () => (
    <View style={styles.typeContainer}>
      <TouchableOpacity
        style={[
          styles.typeButton,
          transactionType === 'expense' && styles.activeTypeButton,
        ]}
        onPress={() => handleTypeChange('expense')}
        activeOpacity={0.8}
      >
        <View style={styles.typeButtonContent}>
          <Ionicons
            name="arrow-up"
            size={20}
            color={transactionType === 'expense' ? theme.colors.white : '#F44336'}
            style={styles.typeIcon}
          />
          <Text
            style={{
              fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
              fontSize: 16,
              fontWeight: '600',
              color: transactionType === 'expense' ? theme.colors.white : '#212121',
              lineHeight: 28,
              paddingBottom: 4,
              includeFontPadding: false,
              textAlignVertical: 'center',
            }}
          >
            Pengeluaran
          </Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.typeButton,
          transactionType === 'income' && styles.activeIncomeButton,
        ]}
        onPress={() => handleTypeChange('income')}
        activeOpacity={0.8}
      >
        <View style={styles.typeButtonContent}>
          <Ionicons
            name="arrow-down"
            size={20}
            color={transactionType === 'income' ? theme.colors.white : '#26A69A'}
            style={styles.typeIcon}
          />
          <Text
            style={{
              fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
              fontSize: 16,
              fontWeight: '600',
              color: transactionType === 'income' ? theme.colors.white : '#212121',
              lineHeight: 28,
              paddingBottom: 4,
              includeFontPadding: false,
              textAlignVertical: 'center',
            }}
          >
            Pemasukan
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );



  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={theme.colors.white} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <View style={styles.headerContainer}>
          <View style={[
            styles.header,
            {
              height: getHeaderHeight(),
              paddingHorizontal: responsiveSpacing(theme.spacing.layout.sm),
            }
          ]}>
            <TouchableOpacity
              style={[
                styles.backButton,
                {
                  width: getBackButtonSize(),
                  height: getBackButtonSize(),
                  borderRadius: getBackButtonSize() / 2,
                }
              ]}
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
            >
              <Ionicons
                name="chevron-back"
                size={isSmallDevice ? 20 : isLargeDevice ? 28 : 24}
                color={theme.colors.primary[500]}
              />
            </TouchableOpacity>

            <Typography
              variant="h5"
              color={theme.colors.primary[500]}
              weight="700"
              style={{ fontSize: 20, textAlign: 'center' }}
            >
              Tambah Transaksi
            </Typography>

            <View style={styles.headerRight} />
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Card style={styles.card}>
            {renderTypeSelector()}

            <View style={{ marginBottom: 16 }}>
              <Controller
                control={control}
                rules={{
                  required: 'Jumlah harus diisi',
                }}
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label="Jumlah"
                    labelStyle={{ color: '#212121', fontWeight: '500' }}
                    placeholder="Masukkan jumlah"
                    placeholderTextColor="#BDBDBD"
                    value={value}
                    onChangeText={text => {
                      // Format sebagai mata uang
                      const numericValue = text.replace(/[^0-9]/g, '');
                      if (numericValue) {
                        onChange(formatCurrency(parseInt(numericValue), { showSymbol: false }));
                      } else {
                        onChange('');
                      }
                    }}
                    onBlur={onBlur}
                    keyboardType="numeric"
                    error={errors.amount?.message}
                    leftIcon={
                      <Ionicons
                        name="cash-outline"
                        size={getIconSize()}
                        color="#2196F3"
                      />
                    }
                    inputStyle={styles.amountInput}
                  />
                )}
                name="amount"
              />
            </View>

            <View>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setShowCategoryPicker(true)}
                activeOpacity={0.7}
              >
                <View style={styles.pickerLabelContainer}>
                  <Ionicons
                    name="pricetag-outline"
                    size={getIconSize()}
                    color="#2196F3"
                    style={styles.pickerIcon}
                  />
                  <Typography
                    variant={isSmallDevice ? "body2" : "body1"}
                    weight="500"
                    color="#212121"
                  >
                    Kategori
                  </Typography>
                </View>
                <View style={styles.pickerValueContainer}>
                  <View style={styles.valueTextContainer}>
                    <Typography
                      variant="body1"
                      color={selectedCategory ? theme.colors.neutral[700] : theme.colors.neutral[400]}
                      style={styles.valueText}
                    >
                      {selectedCategory ? getCategoryName(selectedCategory) : 'Pilih kategori'}
                    </Typography>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={theme.colors.neutral[400]}
                    style={styles.chevronIcon}
                  />
                </View>
              </TouchableOpacity>
            </View>

            <Modal
              visible={showCategoryPicker}
              animationType="slide"
              onRequestClose={() => setShowCategoryPicker(false)}
            >
              <CategoryPicker
                categories={categories}
                selectedCategoryId={selectedCategory}
                transactionType={transactionType}
                onCategorySelected={handleCategorySelect}
                onCancel={() => setShowCategoryPicker(false)}
                title={`Pilih Kategori ${transactionType === 'expense' ? 'Pengeluaran' : 'Pemasukan'}`}
                isLoading={isLoadingCategories}
              />
            </Modal>

            <View style={{ marginTop: 8 }}>
              <Controller
                control={control}
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label="Deskripsi"
                    labelStyle={{ color: '#212121', fontWeight: '500' }}
                    placeholder="Masukkan deskripsi (opsional)"
                    placeholderTextColor="#BDBDBD"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    multiline
                    leftIcon={
                      <Ionicons
                        name="document-text-outline"
                        size={20}
                        color="#2196F3"
                      />
                    }
                  />
                )}
                name="description"
              />
            </View>

            <View style={{ marginTop: 8 }}>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setShowDatePicker(true)}
                activeOpacity={0.7}
              >
                <View style={styles.pickerLabelContainer}>
                  <Ionicons
                    name="calendar-outline"
                    size={20}
                    color="#2196F3"
                    style={styles.pickerIcon}
                  />
                  <Typography variant="body1" weight="500" color="#212121">
                    Tanggal
                  </Typography>
                </View>
                <View style={styles.pickerValueContainer}>
                  <View style={styles.valueTextContainer}>
                    <Typography
                      variant="body1"
                      color={theme.colors.neutral[700]}
                      style={styles.valueText}
                    >
                      {formatDate(selectedDate, { format: 'medium' })}
                    </Typography>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={theme.colors.neutral[400]}
                    style={styles.chevronIcon}
                  />
                </View>
              </TouchableOpacity>
            </View>

            <Modal
              visible={showDatePicker}
              animationType="slide"
              onRequestClose={() => setShowDatePicker(false)}
            >
              <DatePicker
                selectedDate={selectedDate}
                onDateSelected={handleDateChange}
                onCancel={() => setShowDatePicker(false)}
                title="Pilih Tanggal Transaksi"
                maxDate={new Date()} // Tidak bisa pilih tanggal masa depan
              />
            </Modal>

            <View style={{ marginTop: 8 }}>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setShowLocationPicker(true)}
                activeOpacity={0.7}
              >
                <View style={styles.pickerLabelContainer}>
                  <Ionicons
                    name="location-outline"
                    size={20}
                    color="#2196F3"
                    style={styles.pickerIcon}
                  />
                  <Typography variant="body1" weight="500" color="#212121">
                    Lokasi
                  </Typography>
                </View>
                <View style={styles.pickerValueContainer}>
                  <View style={styles.valueTextContainer}>
                    {selectedLocation ? (
                      <Typography
                        variant="body1"
                        color={theme.colors.neutral[700]}
                        style={styles.valueText}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {selectedLocation.address ? formatLocationAddress(selectedLocation.address) : 'Lokasi dipilih'}
                      </Typography>
                    ) : (
                      <Typography
                        variant="body1"
                        color={theme.colors.neutral[400]}
                        style={styles.valueText}
                      >
                        Pilih lokasi (opsional)
                      </Typography>
                    )}
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={theme.colors.neutral[400]}
                    style={styles.chevronIcon}
                  />
                </View>
              </TouchableOpacity>
            </View>

            {/* Tips Section */}
            <View style={styles.tipsContainer}>
              <View style={styles.tipsHeader}>
                <Ionicons name="bulb-outline" size={20} color={theme.colors.primary[500]} />
                <Typography variant="body1" weight="600" color={theme.colors.primary[700]} style={styles.tipsTitle}>
                  Tips Pencatatan
                </Typography>
              </View>
              <View style={styles.tipsList}>
                <View style={styles.tipItem}>
                  <View style={styles.tipBullet} />
                  <Typography variant="body2" color={theme.colors.neutral[600]} style={styles.tipText}>
                    Catat transaksi segera setelah terjadi agar tidak lupa
                  </Typography>
                </View>
                <View style={styles.tipItem}>
                  <View style={styles.tipBullet} />
                  <Typography variant="body2" color={theme.colors.neutral[600]} style={styles.tipText}>
                    Pilih kategori yang tepat untuk analisis keuangan yang akurat
                  </Typography>
                </View>
                <View style={styles.tipItem}>
                  <View style={styles.tipBullet} />
                  <Typography variant="body2" color={theme.colors.neutral[600]} style={styles.tipText}>
                    Tambahkan deskripsi untuk memudahkan pelacakan di masa depan
                  </Typography>
                </View>
              </View>
            </View>
          </Card>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSubmit(onSubmit)}
            activeOpacity={0.8}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color={theme.colors.white} size="small" />
            ) : (
              <View style={styles.saveButtonContent}>
                <Ionicons
                  name="save"
                  size={20}
                  color={theme.colors.white}
                  style={{ marginRight: 8 }}
                />
                <Typography variant="body1" weight="700" color={theme.colors.white}>
                  SIMPAN
                </Typography>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <Modal
          visible={showLocationPicker}
          animationType="slide"
          onRequestClose={() => setShowLocationPicker(false)}
        >
          <LocationPicker
            initialLocation={selectedLocation}
            onLocationSelected={handleLocationSelect}
            onCancel={() => setShowLocationPicker(false)}
          />
        </Modal>

        {/* Superior Dialog */}
        <SuperiorDialog
          visible={dialogState.visible}
          type={dialogState.type}
          title={dialogState.title}
          message={dialogState.message}
          actions={dialogState.actions}
          onClose={hideDialog}
          icon={dialogState.icon}
          autoClose={dialogState.autoClose}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.neutral[50],
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  headerContainer: {
    backgroundColor: theme.colors.white,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.neutral[200],
    ...theme.elevation.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    position: 'relative',
  },
  backButton: {
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    left: theme.spacing.layout.sm, 
    zIndex: 1,
  },
  headerRight: {
    width: 40,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 120, 
  },
  card: {
    padding: 24,
    borderRadius: 16,
    ...theme.elevation.md,
    marginTop: 0,
    marginBottom: 16,
  },
  typeContainer: {
    flexDirection: 'row',
    marginBottom: 24,
    borderRadius: 8,
    overflow: 'hidden',
    marginHorizontal: 0,
    marginTop: 0,
    minHeight: 60,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    marginHorizontal: 4,
    borderRadius: 8,
    ...theme.elevation.xs,
    minHeight: 60,
  },
  typeButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    minHeight: 44,
  },
  typeIcon: {
    marginRight: 8,
  },
  activeTypeButton: {
    backgroundColor: '#F44336', 
    ...theme.elevation.sm,
  },
  activeIncomeButton: {
    backgroundColor: '#26A69A', 
    ...theme.elevation.sm,
  },
  amountInput: {
    fontSize: 16,
    fontWeight: '500',
  },
  pickerButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center', 
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
    marginBottom: 8,
    minHeight: 50,
  },
  pickerLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    minWidth: 100, 
    marginRight: 12, 
  },
  pickerValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between', 
    flex: 1,
    minHeight: 44,
  },
  pickerIcon: {
    marginRight: 8,
    color: theme.colors.primary[500],
  },

  valueTextContainer: {
    flex: 1,
    justifyContent: 'center',
    marginRight: 12,
  },
  valueText: {
    fontSize: 14,
    textAlign: 'left',
  },

  chevronIcon: {
    flexShrink: 0,
    marginLeft: 8,
  },


  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.white,
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: theme.colors.neutral[200],
    ...theme.elevation.lg,
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButton: {
    backgroundColor: '#2196F3',
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    ...theme.elevation.md,
  },
  saveButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipsContainer: {
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: theme.colors.neutral[200],
  },
  tipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  tipsTitle: {
    marginLeft: 8,
  },
  tipsList: {
    gap: 12,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: 4,
  },
  tipBullet: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.primary[500],
    marginTop: 8,
    marginRight: 12,
  },
  tipText: {
    flex: 1,
    lineHeight: 20,
  },
});
