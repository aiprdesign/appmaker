// The app's design: colors, corners, card style and fonts.
// Written by Appmaker from the Design tab — change the design there, not here.
// Follows the phone's light or dark setting.
import { Appearance } from 'react-native';

const light = { colors: {"primary":"#2157cf","onPrimary":"#FFFFFF","primarySoft":"#e5ecfd","background":"#F7F7FA","surface":"#FFFFFF","text":"#111827","muted":"#5F6B7A","border":"#E5E7EB","outline":"#8A8F98","success":"#047857","danger":"#B91C1C"}, card: {"backgroundColor":"#FFFFFF","borderRadius":20,"boxShadow":"0px 4px 12px rgba(17, 24, 39, 0.08)"} };
const dark = { colors: {"primary":"#6a95f1","onPrimary":"#111111","primarySoft":"#1a2952","background":"#0B0B10","surface":"#16161F","text":"#F5F5F7","muted":"#A1A1AA","border":"#2A2A38","outline":"#6B6B80","success":"#34D399","danger":"#F87171"}, card: {"backgroundColor":"#16161F","borderRadius":20,"boxShadow":"0px 4px 12px rgba(0, 0, 0, 0.4)"} };

export const mode = Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
const current = mode === 'dark' ? dark : light;
export const colors = current.colors;
export const card = current.card;
export const radius = {"sm":8,"md":14,"lg":20,"pill":999};
export const font = {"heading":"800","body":"400"};

const theme = { mode, colors, radius, font, card };
export default theme;
