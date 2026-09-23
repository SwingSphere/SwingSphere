-- Populate official contact details for Modern Lifestyle Events and Her Fantasy Party.
-- The Test Club is intentionally left unchanged so admin content-health continues to flag it.

update public.organizations
set website = 'https://modernlifestyle.co/',
    contact_email = 'modernlifestyle@worldmodern.com',
    updated_at = now()
where id = 'org-operator-modern-lifestyle-events';

update public.organizations
set website = 'https://www.herfantasyparty.com/',
    contact_email = 'support@worldmodern.com',
    updated_at = now()
where id = 'org-promoter-her-fantasy-party';
