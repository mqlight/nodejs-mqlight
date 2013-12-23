{
    "targets": [{
        "target_name": "proton",
        "type": "loadable_module",
        "cflags_cc+": ["-Wall", "-Wno-comment", "-g"],
        "sources": ["messenger.cpp", "message.cpp", "proton.cpp"],
        "include_dirs+": ["."],
        "link_settings": {
            "libraries": ["-lqpid-proton"],
            #"library_dirs": [".", ".."]
        }
    }]
}
