#![cfg(target_os = "linux")]

use gio::glib::variant::ToVariant;

#[test]
fn string_variant_iteration_uses_valid_output_pointers() {
    let value = vec!["one", "two", "three"].to_variant();
    assert_eq!(
        value.array_iter_str().unwrap().collect::<Vec<_>>(),
        vec!["one", "two", "three"]
    );
    assert_eq!(value.array_iter_str().unwrap().last(), Some("three"));
    assert_eq!(value.array_iter_str().unwrap().nth(1), Some("two"));
    assert_eq!(value.array_iter_str().unwrap().next_back(), Some("three"));
    assert_eq!(value.array_iter_str().unwrap().nth_back(1), Some("two"));
}
