-- Add "Builder Flat Back Facing" residential property type

-- Shift display_order for existing residential types at position 9+
UPDATE "flat_property_types"
SET "display_order" = "display_order" + 1,
    "updated_at" = NOW()
WHERE "main_category" = 'residential' AND "display_order" >= 9;

-- Insert the new type
INSERT INTO "flat_property_types" (
    "id", "name", "slug", "main_category", "icon",
    "display_order", "is_active",
    "bhk_required", "floor_required", "plot_area_required",
    "legacy_category_slug", "legacy_type_slug",
    "created_at", "updated_at"
) VALUES (
    gen_random_uuid(),
    'Builder Flat Back Facing',
    'builder_flat_back_facing',
    'residential',
    NULL,
    9,
    true,
    true,
    true,
    false,
    'residential',
    'builder_flat',
    NOW(),
    NOW()
);
