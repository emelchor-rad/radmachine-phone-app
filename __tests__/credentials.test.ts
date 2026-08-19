import {
  humanizeTenant,
  instanceLabelFromBaseUrl,
  tenantFromBaseUrl,
} from '../src/secure/credentials';

describe('tenantFromBaseUrl', () => {
  it('extracts tenant from standard RadMachine API URL', () => {
    expect(tenantFromBaseUrl('https://radmachine.radformation.com/emelchor/api')).toBe('emelchor');
    expect(tenantFromBaseUrl('https://radmachine.radformation.com/emelchor/api/')).toBe('emelchor');
  });

  it('returns null for non-standard URLs', () => {
    expect(tenantFromBaseUrl('https://example.com/api')).toBeNull();
  });
});

describe('humanizeTenant', () => {
  it('title-cases hyphen and underscore slugs', () => {
    expect(humanizeTenant('radmachine-demo')).toBe('Radmachine Demo');
    expect(humanizeTenant('my_clinic')).toBe('My Clinic');
  });
});

describe('instanceLabelFromBaseUrl', () => {
  it('humanizes tenant when no stored name', () => {
    expect(instanceLabelFromBaseUrl('https://radmachine.radformation.com/emelchor/api')).toBe(
      'Emelchor'
    );
  });

  it('falls back to RadMachine for unknown URLs', () => {
    expect(instanceLabelFromBaseUrl('https://example.com/api')).toBe('RadMachine');
  });
});
