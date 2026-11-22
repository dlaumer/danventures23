ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS number_of_rides integer;
UPDATE public.locations SET number_of_rides = 1 WHERE number_of_rides IS NULL OR number_of_rides < 1;
ALTER TABLE public.locations ALTER COLUMN number_of_rides SET DEFAULT 1;
ALTER TABLE public.locations ALTER COLUMN number_of_rides SET NOT NULL;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'locations_number_of_rides_positive' AND conrelid = 'public.locations'::regclass) THEN
        ALTER TABLE public.locations ADD CONSTRAINT locations_number_of_rides_positive CHECK (number_of_rides >= 1);
    END IF;
END $$;
