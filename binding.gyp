{
    "targets": [{
        "target_name": "proton",
        "type": "loadable_module",
        "cflags_cc+": ["-Wall", "-Wno-comment", "-g"],
        "sources": ["messenger.cpp", "message.cpp", "proton.cpp"],
        "include_dirs+": [".", "<!(echo $BROOT)/ship/opt/mqm/include"],
        "libraries": ["-lqpid-proton", "-L<!(echo $BROOT)/ship/opt/mqm/lib64", "-Wl,-rpath=\'$$ORIGIN/../../../../../lib64\'"],
    }]
}
