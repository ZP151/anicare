import { useColorScheme } from 'react-native';
import { colors } from './theme';

export type InterfaceColors = { readonly [Key in keyof typeof colors]: string };
const light: InterfaceColors = { ...colors, canvas: '#F2F2F7', ink: '#1C1C1E', muted: '#62626A', line: '#D1D1D6' };
const dark: InterfaceColors = {
  ...light, canvas: '#000000', surface: '#1C1C1E', ink: '#F2F2F7', muted: '#AEAEB2',
  line: '#38383A', leafSoft: '#18382D', leaf: '#287A55', actionPrimary: '#83D6BC', danger: '#FF6961',
};

export function useNativeColors(): InterfaceColors {
  return useColorScheme() === 'dark' ? dark : light;
}
