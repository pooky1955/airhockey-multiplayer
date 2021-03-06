const bufc = {
  _tdict: {
    t_id: {},
    id_t: {},
  },
  T: {
    bool: {
      size: () => 1,
      read: (c) => Boolean(c.view.getUint8(c.ptr++)),
      write: (c, data) => c.view.setUint8(c.ptr++, +data),
    },
    uint8: {
      size: () => 1,
      read: (c) => c.view.getUint8(c.ptr++),
      write: (c, data) => c.view.setUint8(c.ptr++, data),
    },
    uint16: {
      size: () => 2,
      read: (c) => c.view.getUint16((c.ptr += 2) - 2),
      write: (c, data) => c.view.setUint16((c.ptr += 2) - 2, data),
    },
    uint32: {
      size: () => 4,
      read: (c) => c.view.getUint32((c.ptr += 4) - 4),
      write: (c, data) => c.view.setUint32((c.ptr += 4) - 4, data),
    },
    int8: {
      size: () => 1,
      read: (c) => c.view.getInt8(c.ptr++),
      write: (c, data) => c.view.setInt8(c.ptr++, data),
    },
    int16: {
      size: () => 2,
      read: (c) => c.view.getInt16((c.ptr += 2) - 2),
      write: (c, data) => c.view.setInt16((c.ptr += 2) - 2, data),
    },
    int32: {
      size: () => 4,
      read: (c) => c.view.getInt32((c.ptr += 4) - 4),
      write: (c, data) => c.view.setInt32((c.ptr += 4) - 4, data),
    },
    float32: {
      size: () => 4,
      read: (c) => c.view.getFloat32((c.ptr += 4) - 4),
      write: (c, data) => c.view.setFloat32((c.ptr += 4) - 4, data),
    },
    float64: {
      size: () => 8,
      read: (c) => c.view.getFloat32((c.ptr += 8) - 8),
      write: (c, data) => c.view.setFloat32((c.ptr += 8) - 8, data),
    },
    time: {
      size: () => 9,
      read: (c) => {
        let res = new Date();
        res.setFullYear(bufc.T.uint16.read(c));
        res.setMonth(bufc.T.uint8.read(c));
        res.setDate(bufc.T.uint8.read(c));
        res.setHours(bufc.T.uint8.read(c));
        res.setMinutes(bufc.T.uint8.read(c));
        res.setSeconds(bufc.T.uint8.read(c));
        res.setMilliseconds(bufc.T.uint16.read(c));
        return res;
      },
      write: (c, date) => {
        bufc.T.uint16.write(c, date.getFullYear());
        bufc.T.uint8.write(c, date.getMonth());
        bufc.T.uint8.write(c, date.getDate());
        bufc.T.uint8.write(c, date.getHours());
        bufc.T.uint8.write(c, date.getMinutes());
        bufc.T.uint8.write(c, date.getSeconds());
        bufc.T.uint16.write(c, date.getMilliseconds());
      },
    },
    enum: (...values) => {
      return {
        size: () => 1,
        read: (c) => values[bufc.T.uint8.read(c)],
        write: (c, data) => bufc.T.uint8.write(c, values.indexOf(data)),
      };
    },
    any: {
      fluid: true,
      size: (data) => 1 + bufc.T[bufc.typeFit(data)].size(data),
      read: (c) => bufc.T[bufc._tdict.id_t[bufc.T.uint8.read(c)]].read(c),
      write: (c, data) => {
        let type = bufc.typeFit(data);
        bufc.T.uint8.write(c, bufc._tdict.t_id[type]);
        bufc.T[type].write(c, data);
      },
    },
    array: (type, header) => {
      header = header || bufc.T.uint8;
      return {
        fluid: true,
        size: type.fluid ? (data) => header.size() + data.reduce((acc, elem) => acc + type.size(elem), 0) : (data) => header.size() + data.length * type.size(),
        read: (c) => Array.from({ length: header.read(c) }).map(() => type.read(c)),
        write: (c, data) => {
          header.write(c, data.length);
          for (let elem of data) type.write(c, elem);
        },
      };
    },
    string: (type, header) => {
      type = type || bufc.T.uint8;
      header = header || bufc.T.uint8;
      return {
        fluid: true,
        size: (data) => header.size() + data.length * type.size(),
        read: (c) =>
          Array(header.read(c))
            .fill()
            .map(() => String.fromCharCode(type.read(c)))
            .join(""),
        write: (c, data) => {
          header.write(c, data.length);
          for (let elem of data) type.write(c, elem.charCodeAt());
        },
      };
    },
    strand: (length, type) => {
      type = type || bufc.T.uint8;
      return {
        size: () => length * type.size(),
        read: (c) =>
          Array(length)
            .fill()
            .map(() => String.fromCharCode(type.read(c)))
            .join(""),
        write: (c, data) => {
          for (let i = 0; i < length; i++) type.write(c, data.charCodeAt(i));
        },
      };
    },
    struct: (struct) => {
      const keys = Object.keys(struct);
      let fluid = false,
        size;

      for (let key of keys) if (struct[key].fluid) fluid = true;
      if (!fluid) size = keys.reduce((acc, key) => acc + struct[key].size(), 0);
      return {
        fluid,
        size: fluid ? (data) => keys.reduce((acc, key) => acc + struct[key].size(data[key]), 0) : () => size,
        read: (c) => {
          let res = {};
          for (let key of keys) res[key] = struct[key].read(c);
          return res;
        },
        write: (c, data) => keys.forEach((key) => struct[key].write(c, data[key])),
      };
    },
    tuple: (...types) => {
      let fluid = false;
      let size;
      for (let t of types) if (t.fluid) fluid = true;
      if (!fluid) size = types.reduce((acc, t) => acc + t.size(), 0);
      return {
        fluid,
        size: fluid ? (data) => types.reduce((acc, t, i) => acc + t.size(data[i]), 0) : () => size,
        read: (c) => types.map((t) => t.read(c)),
        write: (c, data) => types.forEach((t, i) => t.write(c, data[i])),
      };
    },
    object: {
      fluid: true,
      size: (data) => 1 + Object.keys(data).reduce((acc, key) => acc + bufc.T.string8_8.size(key) + bufc.T.any.size(data[key]), 0),
      read: (c) => {
        let res = {};
        let length = bufc.T.uint8.read(c);
        for (let i = 0; i < length; i++) res[bufc.T.string8_8.read(c)] = bufc.T.any.read(c);
        return res;
      },
      write: (c, data) => {
        let keys = Object.keys(data);
        bufc.T.uint8.write(c, keys.length);
        for (let key of keys) {
          bufc.T.string8_8.write(c, key);
          bufc.T.any.write(c, data[key]);
        }
      },
    },
    lock: (maker, size, mtype, mheader) => {
      let type = maker(mtype, mheader);
      type.fluid = false;
      let psize = mheader.size() + size * mtype.size();
      type.size = () => psize;
      return type;
    },
  },
  typeFit: (v) => bufc._typeofFit[typeof v](v),
  _typeofFit: {
    boolean: () => "bool",
    number: (n) => {
      if (n % 1 === 0)
        if (n >= 0) {
          if (n <= 255) return "uint8";
          if (n <= 65535) return "uint16";
          if (n <= 4294967295) return "uint32";
          return "float64";
        } else {
          if (n >= -128 && n <= 127) return "int8";
          if (n >= -32768 && n <= 32767) return "int16";
          if (n >= -2147483648 && n <= 2147483647) return "int32";
          return "float64";
        }
      return "float64";
    },
    string: (s) => {
      if (/^[\x00-\xff]*$/.test(s)) return s.length > 255 ? "string16_8" : "string8_8";
      return s.length > 255 ? "string16_16" : "string8_16";
    },
    object: (o) => {
      if (o instanceof Date) return "time";
      if (o instanceof Array) return o.length > 255 ? "list16" : "list8";
      return "object";
    },
  },
  buildType: (t) => {
    if (!t) return bufc.T.any;
    if (typeof t === "function") return t();
    if (t.size && t.read && t.write) return t;
    if (t instanceof Array) {
      if (t.length == 1) return bufc.T.array(bufc.buildType(t[0]));
      else if (typeof t[0] === "number") {
        let times = t[0];
        let rtypes = t.slice(1).map((t) => bufc.buildType(t));
        return bufc.T.tuple(
          ...Array(times)
            .fill()
            .map(() => rtypes)
            .flat()
        );
      } else return bufc.T.tuple(...t.map((e) => bufc.buildType(e)));
    } else if (t instanceof Object) {
      let s = {};
      for (let key in t) s[key] = bufc.buildType(t[key]);
      return bufc.T.struct(s);
    }
  },
  Model: class {
    constructor(type) {
      this.type = bufc.buildType(type);
    }
    parse(bin) {
      const c = {
        view: new DataView(bin),
        ptr: 0,
        bin,
      };
      return this.type.read(c);
    }
    serialize(data) {
      const buffer = new ArrayBuffer(this.type.size(data));
      const c = {
        view: new DataView(buffer),
        ptr: 0,
      };
      this.type.write(c, data);
      return buffer;
    }
  },
  Instruction: class {
    constructor(type, handler) {
      this.type = bufc.buildType(type);
      this.handler = handler;
    }
    execute(c) {
      this.handler(this.type.read(c));
    }
  },
  Machine: class {
    constructor(header = bufc.T.uint8) {
      this.header = header;
      this.instructions = {};
      this.packed = [];
      this.size = 0;
    }
    register(id, command) {
      this.instructions[id] = command;
    }
    eval(bin) {
      const c = {
        view: new DataView(bin),
        ptr: 0,
        bin,
      };
      while (c.ptr < c.view.byteLength) this.instructions[this.header.read(c)].execute(c);
    }
    pack(id, data) {
      this.packed.push({ id, data });
      this.size += this.header.size(id) + this.instructions[id].type.size(data);
      return this;
    }
    compile() {
      const buffer = new ArrayBuffer(this.size);
      const c = {
        view: new DataView(buffer),
        ptr: 0,
      };
      for (let p of this.packed) {
        this.header.write(c, p.id);
        this.instructions[p.id].type.write(c, p.data);
      }
      return buffer;
    }
  },
};
bufc.T.array8 = (type) => bufc.T.array(type, bufc.T.uint8);
bufc.T.array16 = (type) => bufc.T.array(type, bufc.T.uint16);
bufc.T.array32 = (type) => bufc.T.array(type, bufc.T.uint32);

bufc.T.string8_8 = bufc.T.string(bufc.T.uint8, bufc.T.uint8);
bufc.T.string16_8 = bufc.T.string(bufc.T.uint8, bufc.T.uint16);
bufc.T.string32_8 = bufc.T.string(bufc.T.uint8, bufc.T.uint32);
bufc.T.string8_16 = bufc.T.string(bufc.T.uint16, bufc.T.uint8);
bufc.T.string16_16 = bufc.T.string(bufc.T.uint16, bufc.T.uint16);
bufc.T.string32_16 = bufc.T.string(bufc.T.uint16, bufc.T.uint32);

bufc.T.list = (header) => bufc.T.array(bufc.T.any, header);
bufc.T.list8 = bufc.T.array(bufc.T.any, bufc.T.uint8);
bufc.T.list16 = bufc.T.array(bufc.T.any, bufc.T.uint16);
bufc.T.list32 = bufc.T.array(bufc.T.any, bufc.T.uint32);

Object.keys(bufc.T).forEach((t, id) => {
  bufc._tdict.id_t[id] = t;
  bufc._tdict.t_id[t] = id;
});

if (typeof module !== "undefined" && module.exports) module.exports = bufc;
