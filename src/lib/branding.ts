/**
 * "Made with Appmaker": a small line at the bottom of free apps' Settings or
 * More screen. The file is written by Appmaker; on the paid plan (or when the
 * site doesn't take payments) it shows nothing.
 */

export const BRAND_FILE = "src/appmaker.js";

export function brandModule(show: boolean): string {
  return show
    ? `// Written by Appmaker: changes here are replaced.
import React from 'react';
import { Text } from 'react-native';
import { colors } from './theme';

export default function MadeWith() {
  return <Text style={{ color: colors.muted, fontSize: 12, textAlign: 'center', marginVertical: 16 }}>Made with Appmaker</Text>;
}
`
    : `// Written by Appmaker: changes here are replaced.
export default function MadeWith() {
  return null;
}
`;
}
