import { useColorScheme } from 'react-native';
import { colors } from './theme';

export type InterfaceColors = { readonly [Key in keyof typeof colors]: string } & { readonly onAction: string };
const light: InterfaceColors = {
  ...colors, onAction: '#FFFFFF', canvas: '#F5F5F7', surface: '#FFFFFF', ink: '#1C1C1E', muted: '#64646B',
  line: '#DEDFE4', leaf: '#2465D8', actionPrimary: '#2465D8', leafSoft: '#E8EFFC',
};
const dark: InterfaceColors = {
  ...light, onAction: '#101D34', canvas: '#111215', surface: '#1D1E23', ink: '#F4F4F7', muted: '#B6B7C0',
  mineral: '#F4F4F7', community: '#89B4FF', aquaDeep: '#89B4FF', aquaSoft: '#20324F', paper: '#111215', actionSecondary: '#FFAD80', line: '#3B3D45', leafSoft: '#20324F', leaf: '#89B4FF', actionPrimary: '#89B4FF', danger: '#FF7B72',
};

export function useNativeColors(): InterfaceColors {
  return useColorScheme() === 'dark' ? dark : light;
}
