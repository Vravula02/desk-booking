CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    resource_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  ) WHERE (status = 'confirmed');

ALTER TABLE bookings
  ADD CONSTRAINT bookings_time_order CHECK (end_at > start_at);

ALTER TABLE resources
  ADD CONSTRAINT resources_capacity_positive CHECK (capacity >= 1);