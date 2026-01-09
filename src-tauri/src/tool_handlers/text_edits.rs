#[derive(Debug, Clone)]
pub struct StringEdit {
    pub old_text: String,
    pub new_text: String,
    pub replace_all: bool,
    pub occurrence: Option<usize>, // 1-indexed
}

fn line_number_at(content: &str, byte_index: usize) -> usize {
    content.as_bytes()[..byte_index.min(content.len())]
        .iter()
        .filter(|b| **b == b'\n')
        .count()
        + 1
}

fn find_nth(haystack: &str, needle: &str, n: usize) -> Option<usize> {
    if needle.is_empty() || n == 0 {
        return None;
    }
    let mut start = 0usize;
    let mut count = 0usize;
    while let Some(idx) = haystack[start..].find(needle) {
        count += 1;
        let abs = start + idx;
        if count == n {
            return Some(abs);
        }
        start = abs + needle.len();
        if start >= haystack.len() {
            break;
        }
    }
    None
}

pub fn apply_string_edits(content: &str, edits: &[StringEdit]) -> Result<(String, usize), String> {
    let mut working = content.to_string();
    let mut total_replacements = 0usize;

    for (idx, edit) in edits.iter().enumerate() {
        if edit.old_text.is_empty() {
            return Err(format!("edits[{}].old_text is empty", idx));
        }
        if edit.replace_all && edit.occurrence.is_some() {
            return Err(format!(
                "edits[{}] cannot set both replace_all and occurrence",
                idx
            ));
        }

        if edit.replace_all {
            let count = working.matches(&edit.old_text).count();
            if count == 0 {
                return Err(format!(
                    "edits[{}] old_text not found (replace_all)",
                    idx
                ));
            }
            working = working.replace(&edit.old_text, &edit.new_text);
            total_replacements += count;
            continue;
        }

        if let Some(n) = edit.occurrence {
            let Some(at) = find_nth(&working, &edit.old_text, n) else {
                return Err(format!(
                    "edits[{}] old_text occurrence {} not found",
                    idx, n
                ));
            };
            let line = line_number_at(&working, at);
            working.replace_range(at..at + edit.old_text.len(), &edit.new_text);
            total_replacements += 1;
            let _ = line; // keep computation for future diagnostics if desired
            continue;
        }

        // Default: must match exactly once.
        let matches = working.match_indices(&edit.old_text).collect::<Vec<_>>();
        if matches.is_empty() {
            return Err(format!("edits[{}] old_text not found", idx));
        }
        if matches.len() > 1 {
            return Err(format!(
                "edits[{}] old_text matched {} times; set replace_all or occurrence",
                idx,
                matches.len()
            ));
        }
        let at = matches[0].0;
        let _line = line_number_at(&working, at);
        working.replace_range(at..at + edit.old_text.len(), &edit.new_text);
        total_replacements += 1;
    }

    Ok((working, total_replacements))
}

