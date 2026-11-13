ALTER TABLE profiles ADD COLUMN IF NOT EXISTS contact_phone text NOT NULL DEFAULT '';
-- Optional WhatsApp/contact number for marketplace reach-outs. Not used for login.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS contact_phone_len;
ALTER TABLE profiles ADD CONSTRAINT contact_phone_len CHECK (char_length(contact_phone) <= 30);
