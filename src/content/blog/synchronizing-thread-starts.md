---
title: '让多线程同步起跑的方法'
description: '记录一种方法，可以让多个线程同步启动'
pubDate: 'Jun 29 2026'
heroImage: '../../assets/blog-placeholder-2.jpg'
tags: ['C++','concurrency']
updatedDate: 'Jun 29 2026'
draft: false
---

我最近在写代码的时候遇到了一个很有趣的需求，我需要让一组工作线程同时开始工作。当然严格意义上的同时在一般的系统上应该是不可能实现的，我们只是期望尽可能地贴近这个目标。

对于大多数的系统来说，如果想要启动一组工作线程，最常见的办法就是把这些线程组织在一个数组里，然后在一个循环中逐一启动。不过这种方式并不能达到我们的目标，因为实际上线程的启动和线程代码的运行在没有阻塞的情况下是相当快的，实际呈现出的效果就是前一个线程已经正式开始工作一段时间了，后一个线程才又被创建，以此类推。

为了解决这个问题，我们可以引入两个原子变量：

```c++
std::atomic<int> ready_count = 0;
std::atomic<bool> started = false;
```

其中，`ready_count`表示有多少个线程准备就绪，`started`是一个信号，表示是否能够同时开始。每个线程在其真正的工作代码之前，都插入这两行代码：

```c++
ready_count.fetch_add(1, std::memory_order_release);
while (!started.load(std::memory_order_acquire)) {}
```

第一行代码表示当前线程已经创建完成，准备就绪，所以给`ready_count`做一次递增，这里使用`memory_order_release`内存序的原因是这次更新需要让主线程看到，所以要进行一次同步。第二行代码是一个忙等循环，线程在这里反复确认主线程是否允许真正启动任务，这里使用`memory_order_acquire`内存序的原因与刚刚的相对应，这里也需要和主线程进行一次同步。

在主线程这边，在逐一把工作线程都初始化好后，则要等待所有的线程就绪，然后更新`started`信号，给所有的线程放行，下面假设只有两个线程：

```c++
while (ready_count.load(std::memory_order_acquire) != 2) {}
started.store(true, std::memory_order_release);
```

可以看到，工作线程里的代码和主线程的代码构成互相对称的同步关系，进而实现了目标，即所有的工作线程基本上可以同步启动，而不是分别启动。
