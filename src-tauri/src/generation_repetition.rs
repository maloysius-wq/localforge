//! Fail-closed detection of prolonged exact output cycles during Bonsai streaming.
//! This does not set a maximum generation duration or token count. The guard
//! retains only a bounded recent window and never writes model output to logs.

const TAIL_BYTES: usize = 16 * 1024;
const CHECK_EVERY_BYTES: usize = 64;
const MIN_REPEAT_UNIT: usize = 96;
const MAX_REPEAT_UNIT: usize = 2048;
const MIN_REPEATED_BYTES: usize = 768;
const MIN_COPIES: usize = 4;

#[derive(Default)]
pub(crate) struct RepetitionGuard {
    tail: Vec<u8>,
    received: usize,
    last_checked: usize,
}

impl RepetitionGuard {
    /// Returns true only after a substantial contiguous cycle is confirmed.
    /// A handful of ordinary reused CSS declarations must not trip the guard.
    pub(crate) fn observe(&mut self, visible_delta: &str) -> bool {
        if visible_delta.is_empty() { return false; }
        self.received = self.received.saturating_add(visible_delta.len());
        self.tail.extend_from_slice(visible_delta.as_bytes());
        if self.tail.len() > TAIL_BYTES {
            let excess = self.tail.len() - TAIL_BYTES;
            self.tail.drain(..excess);
        }
        if self.received.saturating_sub(self.last_checked) < CHECK_EVERY_BYTES { return false; }
        self.last_checked = self.received;
        is_repeating_suffix(&self.tail)
    }
}

fn is_repeating_suffix(bytes: &[u8]) -> bool {
    let len = bytes.len();
    if len < MIN_REPEATED_BYTES { return false; }
    for period in MIN_REPEAT_UNIT..=MAX_REPEAT_UNIT.min(len / MIN_COPIES) {
        let copies = MIN_COPIES.max(MIN_REPEATED_BYTES.div_ceil(period));
        if period * copies > len { continue; }
        let latest = &bytes[len - period..];
        if (2..=copies).all(|copy| {
            let start = len - period * copy;
            &bytes[start..start + period] == latest
        }) {
            return true;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repeated_cell_color_css_is_stopped_across_sse_chunks() {
        let rules = ".cell.red { background: #ff5454; border: 1px solid #883333; }\n\
                     .cell.blue { background: #4477ff; border: 1px solid #334488; }\n\
                     .cell.yellow { background: #f9cb44; border: 1px solid #887733; }\n\
                     .cell.green { background: #55cb77; border: 1px solid #338855; }\n";
        let mut guard = RepetitionGuard::default();
        let mut detected = false;
        for (cycle, _) in (0..8).enumerate() {
            for chunk in rules.as_bytes().chunks(17) {
                detected |= guard.observe(std::str::from_utf8(chunk).unwrap());
            }
            if cycle < 3 { assert!(!detected, "normal CSS reuse should not end the response"); }
        }
        assert!(detected, "repeating the same CSS rules indefinitely must be detected");
    }

    #[test]
    fn distinct_css_colors_and_normal_code_do_not_trip() {
        let mut guard = RepetitionGuard::default();
        for i in 0..150 {
            let rule = format!(".cell-{} {{ background: rgb({}, {}, {}); }}\n",
                i, i % 256, (i * 2) % 256, (i * 3) % 256);
            assert!(!guard.observe(&rule));
        }
        assert!(!guard.observe("function restart() { board = []; render(); }"));
    }

    #[test]
    fn short_repeated_code_and_two_cycles_are_not_enough() {
        let sample = ".tile { display: block; background: slategray; border: 1px solid #eee; }\n";
        let mut guard = RepetitionGuard::default();
        assert!(!guard.observe(&sample.repeat(2)));
        assert!(!is_repeating_suffix(sample.repeat(2).as_bytes()));
        assert!(!is_repeating_suffix("a".repeat(MIN_REPEATED_BYTES - 1).as_bytes()));
        assert!(is_repeating_suffix("a".repeat(MIN_REPEATED_BYTES).as_bytes()));
    }

    #[test]
    fn keeps_only_bounded_bytes_for_very_long_valid_generation() {
        let mut guard = RepetitionGuard::default();
        for i in 0..1000 {
            assert!(!guard.observe(&format!("unique declaration number {i} = {i};\n")));
        }
        assert!(guard.tail.len() <= TAIL_BYTES);
    }
}
