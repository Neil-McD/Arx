pub fn truncate_utf8_for_prompt(value: &str, max_bytes: usize) -> (String, bool) {
    let trimmed = value.trim();
    if trimmed.len() <= max_bytes {
        return (trimmed.to_string(), false);
    }
    let mut end = max_bytes;
    while end > 0 && !trimmed.is_char_boundary(end) {
        end -= 1;
    }
    let out = trimmed[..end].to_string();
    (out, true)
}
