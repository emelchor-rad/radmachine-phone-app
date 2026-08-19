import { RADMACHINE_BLUE } from '../secure/credentials';

export { RADMACHINE_BLUE };

export const RAD_DANGER = '#b00020';

/** Shared stack/tab header chrome — RadMachine navbar blue, white titles. */
export const radHeaderOptions = {
  headerStyle: { backgroundColor: RADMACHINE_BLUE },
  headerTintColor: '#ffffff',
  headerTitleStyle: { fontWeight: 'bold' as const },
  headerShadowVisible: false,
};
