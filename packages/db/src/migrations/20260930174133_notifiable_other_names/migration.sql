ALTER TABLE "notifiable_disease" ADD COLUMN "other_names" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
-- The standard diseases a farm was already given take the standard's other names too (STANDARD_NOTIFIABLE_DISEASES).
UPDATE "notifiable_disease" SET "other_names" = ARRAY['ক্ষুরা', 'খুরা রোগ', 'খুরা', 'এফএমডি', 'FMD']::text[] WHERE "name_bn" = 'ক্ষুরা রোগ' AND "other_names" = '{}'::text[];--> statement-breakpoint
UPDATE "notifiable_disease" SET "other_names" = ARRAY['তড়কা রোগ', 'অ্যানথ্রাক্স', 'এনথ্রাক্স']::text[] WHERE "name_bn" = 'তড়কা' AND "other_names" = '{}'::text[];--> statement-breakpoint
UPDATE "notifiable_disease" SET "other_names" = ARRAY['লাম্পি', 'লাম্পি স্কিন', 'এলএসডি', 'LSD']::text[] WHERE "name_bn" = 'লাম্পি স্কিন ডিজিজ' AND "other_names" = '{}'::text[];--> statement-breakpoint
UPDATE "notifiable_disease" SET "other_names" = ARRAY['গলা ফোলা', 'গলাফোলা রোগ', 'হেমোরেজিক সেপ্টিসেমিয়া', 'Hemorrhagic septicemia', 'HS']::text[] WHERE "name_bn" = 'গলাফোলা' AND "other_names" = '{}'::text[];--> statement-breakpoint
UPDATE "notifiable_disease" SET "other_names" = ARRAY['বাদলা রোগ', 'ব্ল্যাক কোয়ার্টার', 'Blackleg', 'BQ']::text[] WHERE "name_bn" = 'বাদলা' AND "other_names" = '{}'::text[];--> statement-breakpoint
UPDATE "notifiable_disease" SET "other_names" = ARRAY['ব্রুসেলা', 'Brucella']::text[] WHERE "name_bn" = 'ব্রুসেলোসিস' AND "other_names" = '{}'::text[];
