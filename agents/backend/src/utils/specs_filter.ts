/**
 * specs_filter — build Prisma JSON `where` fragments that filter inventory by values stored
 * inside the `specs` JSONB column, replacing the dropped scalar columns
 * (furnishing / facing / property_age / total_floors / features).
 *
 * Added 2026-06-04 (Phase 0 of the website-taxonomy migration) to stop the GlitchTip backend
 * #70 500s: the public listing + AI search were still doing `where.furnishing = …` /
 * `where.features = …` on columns dropped in the 2026-05-28 specs unification.
 *
 * Prod `specs` values are inconsistently cased (e.g. "Fully Furnished" / "Semi-Furnished" /
 * lowercase "unfurnished") while the website sends slugs ("fully_furnished"). Until the Phase-5
 * data-hygiene pass canonicalizes them, we match against a small variant set so a filter
 * resolves regardless of the stored form. (Prisma 5.x Postgres JSON filters.)
 */

function titleCase(words: string[]): string {
    return words
        .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
        .join(' ');
}

/**
 * Expand a single value into the set of forms it might be stored as:
 * the raw input, spaced Title Case, hyphenated Title Case, and the snake_case slug.
 * e.g. "fully_furnished" → ["fully_furnished", "Fully Furnished", "Fully-Furnished"].
 */
export function valueVariants(value: string): string[] {
    const v = String(value ?? '').trim();
    if (!v) return [];
    const words = v.split(/[\s_-]+/).filter(Boolean);
    const spaced = titleCase(words);
    const hyphen = spaced.replace(/ /g, '-');
    const slug = words.map((w) => w.toLowerCase()).join('_');
    return Array.from(new Set([v, spaced, hyphen, slug]));
}

/**
 * Scalar specs filter (furnishing / facing / age / etc.): match a JSON path equals against
 * any variant of any requested value. Returns an `{ OR: [...] }` fragment to push into
 * `where.AND`, or null when there are no values.
 */
export function specsScalarFilter(
    key: string,
    values: string[],
): { OR: Array<{ specs: { path: string[]; equals: string } }> } | null {
    const vals = (values || []).map((v) => String(v).trim()).filter(Boolean);
    if (!vals.length) return null;
    const OR = vals.flatMap((v) =>
        valueVariants(v).map((vv) => ({ specs: { path: [key], equals: vv } })),
    );
    return { OR };
}

/**
 * Array-membership specs filter (amenities): AND semantics across requested values — the
 * listing must contain EVERY selected amenity. Each clause OR's the value's variants so a
 * stored "Lift" matches a requested "lift". Returns one clause per value (push each into
 * `where.AND`); empty array when no values.
 */
export function specsArrayContainsFilter(
    key: string,
    values: string[],
): Array<{ OR: Array<{ specs: { path: string[]; array_contains: string } }> }> {
    const vals = (values || []).map((v) => String(v).trim()).filter(Boolean);
    return vals.map((v) => ({
        OR: valueVariants(v).map((vv) => ({ specs: { path: [key], array_contains: vv } })),
    }));
}
