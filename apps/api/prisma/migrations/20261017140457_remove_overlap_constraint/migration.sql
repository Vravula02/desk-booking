-- This is an empty migration.
ALTER TABLE bookings DROP CONSTRAINT bookings_no_overlap;

DROP EXTENSION IF EXISTS btree_gist;