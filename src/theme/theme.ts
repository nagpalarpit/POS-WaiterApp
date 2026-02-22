export type ThemeColors = {
  // Core colors
  primary: string;
  primaryDark: string;
  primaryLight?: string;
  secondary: string;
  secondaryDark?: string;
  secondaryLight?: string;
  accent: string;
  accentDark?: string;
  accentLight?: string;

  // Backgrounds
  background: string;
  backgroundSecondary?: string;
  backgroundTertiary?: string;

  // Text
  text: string;
  textSecondary?: string;
  textTertiary?: string;
  textInverse?: string;

  // Borders
  border: string;
  borderLight?: string;

  // Status
  success?: string;
  warning?: string;
  error?: string;
  info?: string;

  // Surfaces
  surface: string;
  surfaceHover?: string;
  surfaceActive?: string;

  // Additional UI
  searchBackground?: string;
  headerBackground?: string;
  cardBorder?: string;
  iconColor?: string;
  cartBorder?: string;
  cartGradientFrom?: string;
  cartGradientTo?: string;
  buttonSurface?: string;
  buttonSurfaceHover?: string;
  keyboardButtonBg?: string;
  keyboardButtonBorder?: string;
  keyboardButtonHover?: string;
  cartItemBg?: string;
  cartItemBorder?: string;
  cartItemHover?: string;
  cartItemButtonBg?: string;
  cartItemButtonHover?: string;
  cartDivider?: string;

  // Overlays (modal/backdrop)
  overlay?: string;

  // Typography sizes
  fontSizeXs?: string;
  fontSizeSm?: string;
  fontSizeBase?: string;
  fontSizeLg?: string;
  fontSizeXl?: string;
  fontSize2xl?: string;
  fontSize3xl?: string;
  fontSize4xl?: string;

  // Headings
  headingH1?: string;
  headingH2?: string;
  headingH3?: string;
  headingH4?: string;
  headingH5?: string;
  headingH6?: string;
};

export type ThemeName = 'light' | 'dark' | 'dim';
export const THEMES: Record<ThemeName, ThemeColors> = {
  light: {
    // Primary - Purple theme (current brand color)
    primary: '#604be8',
    primaryDark: '#4a3bb8',
    primaryLight: '#7d6aeb',

    // Secondary - Teal/Green
    secondary: '#10ce9e',
    secondaryDark: '#0da87e',
    secondaryLight: '#2dd4b4',

    // Accent - Orange
    accent: '#ff9d00',
    accentDark: '#cc7d00',
    accentLight: '#ffb333',

    // Background
    background: '#f3f7ff',
    backgroundSecondary: '#ffffff',
    backgroundTertiary: '#eef2f7',

    // Text
    text: '#232121',
    textSecondary: '#4a68a6',
    textTertiary: '#757575',
    textInverse: '#ffffff',

    // Border
    border: '#d8dde6',
    borderLight: '#e8edf6',

    // Status
    success: '#10ce9e',
    warning: '#ff9d00',
    error: '#f26e73',
    info: '#604be8',

    // Surface
    surface: '#ffffff',
    surfaceHover: '#f3f7ff',
    surfaceActive: '#e8edf6',

    // Additional UI colors
    searchBackground: '#ffffff',
    headerBackground: '#f3f7ff',
    cardBorder: '#d8dde6',
    iconColor: '#604be8',
    cartBorder: 'rgba(96, 75, 232, 0.2)', // Subtle purple border matching brand color
    cartGradientFrom: '#ffffff',
    cartGradientTo: '#f3f7ff', // Light blue/purple gradient
    buttonSurface: '#f3f7ff',
    buttonSurfaceHover: '#e8edf6',
    keyboardButtonBg: '#f3f7ff', // Light blue/purple background matching buttonSurface
    keyboardButtonBorder: '#d8dde6', // Light gray border matching theme border
    keyboardButtonHover: '#e8edf6', // Hover state matching borderLight/buttonSurfaceHover
    cartItemBg: '#ffffff', // White background for cart items in light theme
    cartItemBorder: '#e8edf6', // Light border for cart items
    cartItemHover: '#f3f7ff', // Hover state for cart items
    cartItemButtonBg: '#f3f7ff', // Button background in cart items
    cartItemButtonHover: '#e8edf6', // Button hover in cart items
    cartDivider: '#e8edf6', // Divider/border color in cart
    overlay: 'rgba(0,0,0,0.06)',

    // Typography sizes
    fontSizeXs: '0.75rem', // 12px
    fontSizeSm: '0.875rem', // 14px
    fontSizeBase: '1rem', // 16px
    fontSizeLg: '1.125rem', // 18px
    fontSizeXl: '1.25rem', // 20px
    fontSize2xl: '1.5rem', // 24px
    fontSize3xl: '1.875rem', // 30px
    fontSize4xl: '2.25rem', // 36px

    // Heading sizes
    headingH1: '2.25rem', // 36px
    headingH2: '1.875rem', // 30px
    headingH3: '1.5rem', // 24px
    headingH4: '1.25rem', // 20px
    headingH5: '1.125rem', // 18px
    headingH6: '1rem', // 16px
  },

  dark: {
    // Primary - New purple brand color from design
    primary: '#8024DD',
    primaryDark: '#6a1db8',
    primaryLight: '#9a4de8',

    // Secondary - Teal/Green (keeping for consistency)
    secondary: '#10ce9e',
    secondaryDark: '#0da87e',
    secondaryLight: '#2dd4b4',

    // Accent - Orange (keeping for consistency)
    accent: '#ff9d00',
    accentDark: '#cc7d00',
    accentLight: '#ffb333',

    // Background - Exact colors from design
    background: '#141122', // Main dark purple background
    backgroundSecondary: '#221F32', // Card/surface background
    backgroundTertiary: '#060214', // Darkest background (cart background)

    // Text
    text: '#FFFFFF', // Primary white text
    textSecondary: '#B8B5C0', // Secondary text (lighter grey for descriptions)
    textTertiary: '#8A8795', // Tertiary text (even lighter)
    textInverse: '#1D1931', // Dark text on light backgrounds

    // Border
    border: '#2A2538', // Border color (slightly lighter than background)
    borderLight: '#332E42', // Lighter border

    // Status
    success: '#10ce9e',
    warning: '#ff9d00',
    error: '#f26e73',
    info: '#8024DD',

    // Surface - Card and interactive surfaces
    surface: '#221F32', // Card background
    surfaceHover: '#2A2538', // Hover state (slightly lighter)
    surfaceActive: '#8024DD', // Active state (primary color)

    // Additional UI colors for new design
    searchBackground: '#2A2538', // Search input background (slightly lighter than card)
    headerBackground: '#141122', // Header background (same as main background)
    cardBorder: '#2A2538', // Card border (subtle, same as hover)
    iconColor: '#FFFFFF', // Icon color (white)
    cartBorder: '#2f2573', // Cart border color (purple variant)
    cartGradientFrom: '#1b1442', // Cart gradient start color
    cartGradientTo: '#080412', // Cart gradient end color
    buttonSurface: '#120a2d', // Button surface background
    buttonSurfaceHover: '#1c0f3f', // Button hover state
    keyboardButtonBg: 'rgba(255, 255, 255, 0.05)', // White with low opacity
    keyboardButtonBorder: 'rgba(255, 255, 255, 0.1)', // White border with opacity
    keyboardButtonHover: 'rgba(255, 255, 255, 0.1)', // Hover state
    cartItemBg: 'rgba(255, 255, 255, 0.07)', // White with low opacity for cart items
    cartItemBorder: 'rgba(255, 255, 255, 0.15)', // White border with opacity
    cartItemHover: 'rgba(255, 255, 255, 0.1)', // Hover state for cart items
    cartItemButtonBg: 'rgba(255, 255, 255, 0.1)', // Button background in cart items
    cartItemButtonHover: 'rgba(255, 255, 255, 0.2)', // Button hover in cart items
    cartDivider: 'rgba(255, 255, 255, 0.1)', // Divider/border color in cart
    overlay: 'rgba(0,0,0,0.5)',

    // Typography sizes (smaller, more subtle for dark theme)
    fontSizeXs: '0.625rem', // 10px
    fontSizeSm: '0.75rem', // 12px
    fontSizeBase: '0.875rem', // 14px
    fontSizeLg: '1rem', // 16px
    fontSizeXl: '1.125rem', // 18px
    fontSize2xl: '1.25rem', // 20px
    fontSize3xl: '1.5rem', // 24px
    fontSize4xl: '1.875rem', // 30px

    // Heading sizes (smaller, more subtle)
    headingH1: '1.875rem', // 30px
    headingH2: '1.5rem', // 24px
    headingH3: '1.25rem', // 20px
    headingH4: '1.125rem', // 18px
    headingH5: '1rem', // 16px
    headingH6: '0.875rem', // 14px
  },

  dim: {
    // Primary - Brighter purple/violet for better contrast on slate background
    primary: '#A855F7', // Bright purple that pops on dark slate
    primaryDark: '#9333EA', // Darker variant for hover states
    primaryLight: '#C084FC', // Lighter variant for highlights

    // Secondary - Teal/Green (keeping for consistency)
    secondary: '#10ce9e',
    secondaryDark: '#0da87e',
    secondaryLight: '#2dd4b4',

    // Accent - Orange (keeping for consistency)
    accent: '#ff9d00',
    accentDark: '#cc7d00',
    accentLight: '#ffb333',

    // Background - Dark slate/charcoal palette (completely different from dark theme)
    background: '#1a1d28', // Main dark slate blue-gray background
    backgroundSecondary: '#252936', // Card/surface background (lighter slate)
    backgroundTertiary: '#151821', // Darkest background (darker slate)

    // Text - High contrast for visibility
    text: '#FFFFFF', // Primary white text
    textSecondary: '#B8BDC7', // Secondary text (light gray-blue for better visibility)
    textTertiary: '#8B919C', // Tertiary text (medium gray-blue)
    textInverse: '#252936', // Dark text on light backgrounds

    // Border - Slate gray borders
    border: '#3a3f52', // Border color (medium slate gray)
    borderLight: '#4a5064', // Lighter border (lighter slate)

    // Status
    success: '#10ce9e',
    warning: '#ff9d00',
    error: '#f26e73',
    info: '#A855F7', // Match new primary color

    // Surface - Card and interactive surfaces
    surface: '#252936', // Card background (slate gray)
    surfaceHover: '#2e3442', // Hover state (lighter slate)
    surfaceActive: '#A855F7', // Active state (new primary color)

    // Additional UI colors for new design
    searchBackground: '#2e3442', // Search input background (lighter slate)
    headerBackground: '#1a1d28', // Header background (same as main background)
    cardBorder: '#3a3f52', // Card border (medium slate)
    iconColor: '#FFFFFF', // Icon color (white)
    cartBorder: '#4a5064', // Cart border color (lighter slate)
    cartGradientFrom: '#252936', // Cart gradient start color (card background)
    cartGradientTo: '#1a1d28', // Cart gradient end color (main background)
    buttonSurface: '#2e3442', // Button surface background (hover slate)
    buttonSurfaceHover: '#363c4d', // Button hover state (lighter slate)
    keyboardButtonBg: 'rgba(255, 255, 255, 0.1)', // White with opacity for visibility
    keyboardButtonBorder: 'rgba(255, 255, 255, 0.2)', // White border with opacity
    keyboardButtonHover: 'rgba(255, 255, 255, 0.15)', // Hover state
    cartItemBg: 'rgba(255, 255, 255, 0.08)', // White with opacity for cart items
    cartItemBorder: 'rgba(255, 255, 255, 0.2)', // White border with opacity
    cartItemHover: 'rgba(255, 255, 255, 0.12)', // Hover state for cart items
    cartItemButtonBg: 'rgba(255, 255, 255, 0.12)', // Button background in cart items
    cartItemButtonHover: 'rgba(255, 255, 255, 0.2)', // Button hover in cart items
    cartDivider: 'rgba(255, 255, 255, 0.15)', // Divider/border color in cart
    overlay: 'rgba(0,0,0,0.5)',

    // Typography sizes (same as dark theme for consistency)
    fontSizeXs: '0.625rem', // 10px
    fontSizeSm: '0.75rem', // 12px
    fontSizeBase: '0.875rem', // 14px
    fontSizeLg: '1rem', // 16px
    fontSizeXl: '1.125rem', // 18px
    fontSize2xl: '1.25rem', // 20px
    fontSize3xl: '1.5rem', // 24px
    fontSize4xl: '1.875rem', // 30px

    // Heading sizes (same as dark theme)
    headingH1: '1.875rem', // 30px
    headingH2: '1.5rem', // 24px
    headingH3: '1.25rem', // 20px
    headingH4: '1.125rem', // 18px
    headingH5: '1rem', // 16px
    headingH6: '0.875rem', // 14px
  },
};

export const DEFAULT_THEME: ThemeName = 'light';
