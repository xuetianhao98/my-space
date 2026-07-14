---
title: 'std::thread 源码分析'
description: '分析 libc++ 标准库中的线程封装是如何实现的'
pubDate: 'July 14 2026'
heroImage: '../../assets/blog-placeholder-5.jpg'
tags: ['C++', 'libc++']
updatedDate: 'July 14 2026'
draft: false
---

`C++11` 引入了标准库的线程封装类 `std::thread`，如今已经成为了 `C++` 多线程编程的重要基础设施。
大家都知道标准库的实现只是对操作系统提供的底层线程 API 的“简单”封装，但是简单中也蕴含着现代 `C++` 的很多哲学和思想。
本文从 `llvm` 提供的 `libc++` 标准库源码出发，试图解析 `std::thread` 的实现原理，并希望从中获取一些灵感和启发。

## 构造函数

以下是 22.1.8 版本下 `std::thread` 的构造函数的具体实现。

```cpp
#  ifndef _LIBCPP_CXX03_LANG
  template <class _Fp, class... _Args, __enable_if_t<!is_same<__remove_cvref_t<_Fp>, thread>::value, int> = 0>
  _LIBCPP_HIDE_FROM_ABI explicit thread(_Fp&& __f, _Args&&... __args) {
    static_assert(is_constructible<__decay_t<_Fp>, _Fp>::value, "");
    static_assert(_And<is_constructible<__decay_t<_Args>, _Args>...>::value, "");
    static_assert(__is_invocable_v<__decay_t<_Fp>, __decay_t<_Args>...>, "");

    typedef unique_ptr<__thread_struct> _TSPtr;
    _TSPtr __tsp(new __thread_struct);
    typedef tuple<_TSPtr, __decay_t<_Fp>, __decay_t<_Args>...> _Gp;
    unique_ptr<_Gp> __p(new _Gp(std::move(__tsp), std::forward<_Fp>(__f), std::forward<_Args>(__args)...));
    int __ec = std::__libcpp_thread_create(&__t_, std::addressof(__thread_proxy<_Gp>), __p.get());
    if (__ec == 0)
      __p.release();
    else
      __throw_system_error(__ec, "thread constructor failed");
  }
#  else // _LIBCPP_CXX03_LANG
```

代码中涉及到一些与模板编程相关的技巧，这里暂时不展开，我们聚焦到代码中最核心的部分：

```cpp
typedef tuple<_TSPtr, __decay_t<_Fp>, __decay_t<_Args>...> _Gp;
```

以上代码定义了一个自定义类型 `_Gp`，它是一个 `tuple` 类型的数据，内部存储的数据可以分为三个部分：
1. `_TSPtr`：它可以理解为线程的状态，是 `libc++` 自己维护的一个结构体，**它不是线程实例**；
2. `__decay_t<_Fp>`：经过类型退化的可调用对象；
3. `__decay_t<_Args>...`：经过类型退化的参数。

第一次接触这部分代码的人可能会误把 `_TSPtr` 所持有的结构体 `__thread_struct` 理解为底层的线程实例，但它并不是。
真正的线程实例放在 `thread::__t_` 中，它是一个 `public` 类型的变量。
而 `__thread_struct` 是一个存储线程内部退出状态的结构体，可以先不用太过纠结其实现细节。

`_Gp` 中最重要的细节是线程的工作函数（或者说叫做可调用对象）及其参数都经过了 `__decay_t` 退化。
退化是模板编程中的一个工具，用来去除一个类型的所有装饰，包含 `const` 或 `volatile` 等修饰符以及 `&` 和 `&&` 等引用修饰符。
例如，一个 `const int &` 类型的参数经过退化之后会变成 `int` 类型。
这一步是为了保证参数可以被安全的使用，因为在线程真正启动时，无法保证最初的参数没有被销毁，所以在创建线程的时候需要把原始参数复制（或移动）一份存储下来。

接下来，构造函数在堆上创建了一个 `_Gp` 的实例：`unique_ptr<_Gp> __p(new _Gp(...))`。
这里有两个关键的设计：
1. 使用了智能指针 `unique_ptr<_Gp>` ，这保证了函数的异常安全，如果后续任何地方失败，它会自行析构，释放资源；
2. 使用 new 在堆上创建了实例，这保证后续线程真正创建的时候， `__p` 中的数据是有效的。

最后，构造函数调用 `std::__libcpp_thread_create` 创建真实的线程，创建成功则移交 `__p` 的所有权，失败则报错。

在创建线程的时候，有一个需要进一步探索的模板函数 `__thread_proxy` 。

## `__thread_proxy`

简单地理解函数 `__thread_proxy` 的作用，它是为了把用户提供的各种类型的可调用对象转换为操作系统支持的线程入口函数而存在的一个中间层。
其具体实现如下：

```cpp
template <class _TSp, class _Fp, class... _Args, size_t... _Indices>
inline _LIBCPP_HIDE_FROM_ABI void __thread_execute(tuple<_TSp, _Fp, _Args...>& __t, __index_sequence<_Indices...>) {
  std::__invoke(std::move(std::get<_Indices + 1>(__t))...);
}

template <class _Fp>
_LIBCPP_HIDE_FROM_ABI void* __thread_proxy(void* __vp) {
  // _Fp = tuple< unique_ptr<__thread_struct>, Functor, Args...>
  unique_ptr<_Fp> __p(static_cast<_Fp*>(__vp));
  __thread_local_data().set_pointer(std::get<0>(*__p.get()).release());
  std::__thread_execute(*__p.get(), __make_index_sequence<tuple_size<_Fp>::value - 1>());
  return nullptr;
}
```

`__thread_proxy` 是一个模板函数，它接受一个模板参数，并在内部把实际的 `void*` 类型的参数恢复为模板参数的类型，并使用智能指针接管其所有权。
结合上面的构造函数的代码 `__thread_proxy<_Gp>` ，实际上它将把传入的指针恢复为一个 `_Gp` 类型的指针，并且使用其中的数据，
代码中 `unique_ptr<_Fp> __p(static_cast<_Fp*>(__vp))` 即对应这个逻辑。

```cpp
__thread_local_data().set_pointer(std::get<0>(*__p.get()).release());
```

这段代码的作用是把前文提到的线程退出状态 `__TSPtr` 的所有权转移到线程本地。

```cpp
std::__thread_execute(*__p.get(), __make_index_sequence<tuple_size<_Fp>::value - 1>());
```

这段代码用来执行线程，它的实现也列在上面的代码段中。其内部调用了 `std::__invoke` 来执行实际的线程函数。
这里涉及到一些模板编程的技巧和工具，暂且不详细展开了，今后有时间的话我想专门写一点与模板编程有关的文章。

## 一些灵感

我们当然无需自己再实现一个 `my::thread` ，因为标准库提供的实现足够完善，也很好用，但是我们可以从标准库的实现中汲取一些灵感。

举例说明，假设我们要实现一个任务调度系统，允许开发者把它们各自的任务（可调用对象）注册到系统中并择机执行，这个过程就会遇到与实现 `std::thread` 相同的挑战。
如何在框架层屏蔽不同的可调用对象类型？如何保证在任务实际执行的时候其参数都还没有被销毁？
根据前文的源码，我们获得了灵感，可以用 `tuple` 在编译期就完成可调用对象的打包，屏蔽其类型区别，并使用参数退化后再复制（移动）的方式保存参数包，保证参数长期有效。

虽然造轮子不值得推荐，但了解轮子是怎么被造出来的还是很妙的过程。
