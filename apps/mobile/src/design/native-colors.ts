import { useColorScheme } from 'react-native';
import { colors } from './theme';

export type InterfaceColors = { readonly [Key in keyof typeof colors]: string } & { readonly onAction: string };
const light: InterfaceColors = {
  ...colors, onAction: '#FFFFFF', canvas: '#F5F6F3', surface: '#FFFFFF', ink: '#141A17', muted: '#68736C',
  line: '#E0E4DF', leaf: '#176B56', actionPrimary: '#176B56', leafSoft: '#E7F0EA',
};
const dark: InterfaceColors = {
  ...light, onAction: '#10261B', canvas: '#101512', surface: '#1C211C', ink: '#F4F6F2', muted: '#B3BBB5',
  mineral: '#F4F6F2', community: '#79D8B3', aquaDeep: '#79D8B3', aquaSoft: '#1D3B2E', paper: '#101512', actionSecondary: '#FFAD80', line: '#38423B', leafSoft: '#1D3B2E', leaf: '#79D8B3', actionPrimary: '#79D8B3', danger: '#FF7B72',
};

export function useNativeColors(): InterfaceColors {
  return useColorScheme() === 'dark' ? dark : light;
}
