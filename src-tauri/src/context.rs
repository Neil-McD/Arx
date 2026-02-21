use once_cell::sync::Lazy;
use regex::Regex;

#[derive(Debug, Clone)]
pub struct RedactionReport {
    pub blocked: bool,
    pub redactions: Vec<(String, usize)>,
}

static SECRET_PATTERNS: Lazy<Vec<(&'static str, Regex)>> = Lazy::new(|| {
    vec![
        (
            "openai_key",
            Regex::new(r"sk-[A-Za-z0-9]{20,}").expect("openai_key regex must compile"),
        ),
        (
            "anthropic_key",
            Regex::new(r"sk-ant-[A-Za-z0-9_-]{10,}").expect("anthropic_key regex must compile"),
        ),
        (
            "google_key",
            Regex::new(r"AIza[0-9A-Za-z_-]{35}").expect("google_key regex must compile"),
        ),
        (
            "aws_access_key",
            Regex::new(r"AKIA[0-9A-Z]{16}").expect("aws_access_key regex must compile"),
        ),
        (
            "aws_secret",
            Regex::new(r"(?i)aws_secret_access_key\s*=\s*[A-Za-z0-9/+=]{20,}")
                .expect("aws_secret regex must compile"),
        ),
        (
            "generic_api_key",
            Regex::new(r"(?i)api[_-]?key\s*[:=]\s*[A-Za-z0-9_-]{16,}")
                .expect("generic_api_key regex must compile"),
        ),
        (
            "bearer",
            Regex::new(r"(?i)bearer\s+[A-Za-z0-9._=-]{16,}").expect("bearer regex must compile"),
        ),
        (
            "password",
            Regex::new(r"(?i)password\s*[:=]\s*[^\s]{6,}").expect("password regex must compile"),
        ),
        (
            "private_key",
            Regex::new(
                r"-----BEGIN[ A-Z]*PRIVATE KEY-----[\s\S]+?-----END[ A-Z]*PRIVATE KEY-----",
            )
            .expect("private_key regex must compile"),
        ),
    ]
});

fn is_runtime_blocking_kind(kind: &str) -> bool {
    matches!(kind, "private_key" | "aws_secret")
}

pub fn redact_secrets(input: &str) -> (String, RedactionReport) {
    let mut output = input.to_string();
    let mut redactions = Vec::new();

    for (name, regex) in SECRET_PATTERNS.iter() {
        let count = regex.find_iter(&output).count();
        if count > 0 {
            output = regex.replace_all(&output, "[REDACTED]").to_string();
            redactions.push(((*name).to_string(), count));
        }
    }

    let blocked = redactions
        .iter()
        .any(|(kind, _)| is_runtime_blocking_kind(kind));
    (
        output,
        RedactionReport {
            blocked,
            redactions,
        },
    )
}

#[cfg(test)]
mod tests {
    use super::redact_secrets;

    fn assert_detected(input: &str, expected_kind: &str, expected_blocked: bool) {
        let (redacted, report) = redact_secrets(input);
        assert!(
            redacted.contains("[REDACTED]"),
            "expected redacted output for kind={expected_kind}"
        );
        assert_eq!(
            report.blocked, expected_blocked,
            "unexpected blocked status for kind={expected_kind}"
        );
        assert!(
            report
                .redactions
                .iter()
                .any(|(kind, count)| kind == expected_kind && *count >= 1),
            "missing redaction kind={expected_kind}; got {:?}",
            report.redactions
        );
    }

    #[test]
    fn secret_redaction_openai_key_detected() {
        assert_detected(
            "token=sk-1234567890ABCDEFGHIJKLMNOPQRST",
            "openai_key",
            false,
        );
    }

    #[test]
    fn secret_redaction_anthropic_key_detected() {
        assert_detected(
            "token=sk-ant-abcDEF1234_-abcdEF12",
            "anthropic_key",
            false,
        );
    }

    #[test]
    fn secret_redaction_google_key_detected() {
        let key = format!("AIza{}", "A".repeat(35));
        assert_detected(&format!("key={key}"), "google_key", false);
    }

    #[test]
    fn secret_redaction_aws_access_key_detected() {
        assert_detected("AKIA1234567890ABCDEF", "aws_access_key", false);
    }

    #[test]
    fn secret_redaction_aws_secret_detected_and_blocks_runtime() {
        assert_detected(
            "aws_secret_access_key = AbCdEfGhIjKlMnOpQrStUvWxYz012345",
            "aws_secret",
            true,
        );
    }

    #[test]
    fn secret_redaction_generic_api_key_detected() {
        assert_detected(
            "api_key: abcdefghijklmnopQRSTUVWX",
            "generic_api_key",
            false,
        );
    }

    #[test]
    fn secret_redaction_bearer_detected() {
        assert_detected(
            "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
            "bearer",
            false,
        );
    }

    #[test]
    fn secret_redaction_password_detected() {
        assert_detected("password = hunter2", "password", false);
    }

    #[test]
    fn secret_redaction_private_key_detected_and_blocks_runtime() {
        assert_detected(
            "-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----",
            "private_key",
            true,
        );
    }

    #[test]
    fn secret_redaction_clean_text_unchanged() {
        let input = "no secrets in this sentence";
        let (redacted, report) = redact_secrets(input);
        assert_eq!(redacted, input);
        assert!(!report.blocked);
        assert!(report.redactions.is_empty());
    }
}
