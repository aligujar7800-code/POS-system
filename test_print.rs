fn main() {
    let printer_name = "ZDesigner TLP 2844-Z";
    let data = b"^XA^PW304^LL204^FO10,10^A0N,24,24^FDTEST LABEL^FS^FO10,100^BCN,60,Y,N,N^FD123456789^FS^PQ1^XZ";
    
    use std::ffi::CString;
    use std::ptr;

    #[repr(C)]
    struct DocInfoA {
        p_doc_name: *const i8,
        p_output_file: *const i8,
        p_data_type: *const i8,
    }

    #[link(name = "winspool")]
    extern "system" {
        fn OpenPrinterA(pPrinterName: *const i8, phPrinter: *mut usize, pDefault: *const u8) -> i32;
        fn StartDocPrinterA(hPrinter: usize, Level: i32, pDocInfo: *const DocInfoA) -> i32;
        fn StartPagePrinter(hPrinter: usize) -> i32;
        fn WritePrinter(hPrinter: usize, pBuf: *const u8, cbBuf: u32, pcWritten: *mut u32) -> i32;
        fn EndPagePrinter(hPrinter: usize) -> i32;
        fn EndDocPrinter(hPrinter: usize) -> i32;
        fn ClosePrinter(hPrinter: usize) -> i32;
    }

    let printer_cstr = CString::new(printer_name).unwrap();
    let doc_name = CString::new("POS Label").unwrap();
    let data_type = CString::new("RAW").unwrap();

    unsafe {
        let mut h_printer: usize = 0;
        let open_result = OpenPrinterA(printer_cstr.as_ptr(), &mut h_printer, ptr::null());
        println!("OpenPrinterA: {}", open_result);

        let doc_info = DocInfoA {
            p_doc_name: doc_name.as_ptr(),
            p_output_file: ptr::null(),
            p_data_type: data_type.as_ptr(),
        };

        let start_doc_result = StartDocPrinterA(h_printer, 1, &doc_info);
        println!("StartDocPrinterA: {}", start_doc_result);

        let start_page_result = StartPagePrinter(h_printer);
        println!("StartPagePrinter: {}", start_page_result);

        let mut written: u32 = 0;
        let write_result = WritePrinter(h_printer, data.as_ptr(), data.len() as u32, &mut written);
        println!("WritePrinter: {} (written: {})", write_result, written);

        EndPagePrinter(h_printer);
        EndDocPrinter(h_printer);
        ClosePrinter(h_printer);
    }
}
