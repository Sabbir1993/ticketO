// Scopes a merchant's two brand colours to its children only. The site header/footer sit outside this
// wrapper, so they stay platform-branded, and nothing leaks to other pages when the user navigates away.
import { themeStyle } from '@/lib/theme';

export default function MerchantTheme({ theme, className = '', children }) {
  return <div className={className} style={themeStyle(theme)} data-merchant-theme={theme ? 'on' : 'off'}>{children}</div>;
}
