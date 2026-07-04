---
title: '对SPSC队列的简单研究'
description: '对单生产者单消费者队列的简单研究，对比有锁实现和无锁实现'
pubDate: 'Jun 28 2026'
heroImage: '../../assets/blog-placeholder-3.jpg'
tags: ['C++','concurrency']
updatedDate: 'Jun 28 2026'
draft: false
---

`SPSC`队列，即单生产者-单消费者队列，使用者保证永远只会有一个对象向队列中推送数据，也只有一个对象从队列中取出数据，是并发编程里相对简单但极为常见的一种数据结构。我将从最基础的实现开始迭代，最终实现一个标准的`C++`无锁`SPSC`队列并且测试其性能相对于基础版本提升的幅度，并探求其中的原理。

本文章所涉代码可在[spscq](git@github.com:xuetianhao98/spscq.git)查看。

## 测试指标

为了更好的量化一个`SPSC`队列的性能，我们首先要设计一套简单清晰的指标，方便后续对不同版本的实现方案进行测试和评价。现阶段，我们只关注一个指标，就是队列的数据吞吐率，我们可以用`items/s`和`bytes/s`来度量，表示通过这个队列，每秒能够处理多少数据。

在测试时，我们会使用最基本的`int`类型作为队列处理的类型，先不加入更复杂的数据结构。

## 接口设计

在写代码之前，应该先认真思考接口的设计。我不准备让我的队列提供阻塞接口，因为SPSC队列通常是被用在高性能编程领域，或者是对性能非常敏感的底层，实践上来说没有必要提供阻塞接口。只需要提供非阻塞的入队、出队接口，然后让用户自己来决定当操作失败的时候后续的策略。所以，我们在最初的版本，不妨只实现两个接口：`try_push`和`try_pop`。前者的语义是尝试把数据推入队列，返回值表示是否成功，后者的语义是尝试从队列中取出一个数据，返回值也表示是否成功。

```c++
bool TryPush(const T& val);
bool TryPop(T& val);
```

在这两个核心的接口之外，还可以提供几个辅助方法，让使用者知道这个队列的最大容量和当前的状态。

```c++
int capacity() const;
bool empty() const;
bool full() const;
```

以上接口对于一个基础的SPSC队列来说就足够了。

## 基础实现：对`std::queue`的简单封装

`C++`对于常用的并发数据结构没有标准库级别的实现，最简单的实现就是把标准库的数据结构和一个互斥进行组合，把相关的读写操作用互斥保护起来即可。这种实现是在性能没有要求的场景里非常推荐的写法，因为这种实现的性能也没有很差，但是逻辑清晰，非常符合当年很流行的一种编程哲学：too simple to be wrong，下面是其代码的具体实现。

```c++
#pragma once

#include <mutex>
#include <queue>

namespace spscq {

/// A basic bounded queue protected by a mutex.
template <typename T>
class MutexQueue {
 public:
  using SizeType = typename std::queue<T>::size_type;

  explicit MutexQueue(SizeType capacity) : capacity_(capacity) {}

  bool TryPush(const T& val) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (IsFullLocked()) {
      return false;
    }

    queue_.push(val);
    return true;
  }

  bool TryPop(T& val) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (queue_.empty()) {
      return false;
    }

    val = queue_.front();
    queue_.pop();
    return true;
  }

  SizeType capacity() const { return capacity_; }

  bool empty() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return queue_.empty();
  }

  bool full() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return IsFullLocked();
  }

 private:
  bool IsFullLocked() const { return queue_.size() >= capacity_; }

  mutable std::mutex mutex_;
  std::queue<T> queue_;
  const SizeType capacity_;
};

}  // namespace spscq
```

这个实现方案作为最基础的实现，其实没有考虑到“单生产者-单消费者”的场景，用一个互斥把所有操作都保护了，实际上是保证了任意并发场景下的正确性。

## 无锁实现

接下来我们使用原子变量实现一个无锁的SPSC队列，底层数据结构使用固定大小数组，借助一个原子读指针和一个原子写指针实现无锁读写。生产者获取队列的写指针，放入数据并修改指针，对应地，消费者获取队列的读指针，读取数据并修改指针。

在实现时，可以用合适的内存序来对读写操作进行同步。`TryPush`操作读取读指针（使用`std::memory_order_acquire`），修改写指针（使用`std::memory_order_release`），`TryPop`操作则相反，两者刚好互为一组同步，保证读线程和写线程同时操作的正确性。

```c++
#pragma once

#include <array>
#include <atomic>
#include <cstddef>

namespace spscq {

/// A lock-free Single Producer Single Consumer ring buffer queue.
template <typename T, int kCapacity>
class RingBuffer {
  static_assert(kCapacity > 0, "RingBuffer capacity must be positive.");
  static_assert(std::atomic<T*>::is_always_lock_free,
                "RingBuffer requires lock-free atomic pointers.");

 public:
  RingBuffer() : read_ptr_(buffer_.data()), write_ptr_(buffer_.data()) {}

  RingBuffer(const RingBuffer&) = delete;
  RingBuffer& operator=(const RingBuffer&) = delete;

  bool TryPush(const T& val) {
    T* write_ptr = write_ptr_.load(std::memory_order_relaxed);
    T* next_write_ptr = Next(write_ptr);

    if (next_write_ptr == read_ptr_.load(std::memory_order_acquire)) {
      return false;
    }

    *write_ptr = val;
    write_ptr_.store(next_write_ptr, std::memory_order_release);
    return true;
  }

  bool TryPop(T& val) {
    T* read_ptr = read_ptr_.load(std::memory_order_relaxed);

    if (read_ptr == write_ptr_.load(std::memory_order_acquire)) {
      return false;
    }

    val = *read_ptr;
    read_ptr_.store(Next(read_ptr), std::memory_order_release);
    return true;
  }

  int capacity() const { return kCapacity; }

  bool empty() const {
    return read_ptr_.load(std::memory_order_acquire) ==
           write_ptr_.load(std::memory_order_acquire);
  }

  bool full() const {
    const T* write_ptr = write_ptr_.load(std::memory_order_acquire);
    const T* read_ptr = read_ptr_.load(std::memory_order_acquire);
    return Next(write_ptr) == read_ptr;
  }

 private:
  static constexpr int kStorageCapacity = kCapacity + 1;

  T* Next(T* ptr) {
    ++ptr;
    if (ptr == buffer_.data() + kStorageCapacity) {
      return buffer_.data();
    }
    return ptr;
  }

  const T* Next(const T* ptr) const {
    ++ptr;
    if (ptr == buffer_.data() + kStorageCapacity) {
      return buffer_.data();
    }
    return ptr;
  }

  // One slot is reserved so equal read/write pointers represent empty.
  std::array<T, static_cast<std::size_t>(kStorageCapacity)> buffer_{};
  std::atomic<T*> read_ptr_;
  std::atomic<T*> write_ptr_;
};

}  // namespace spscq

```

无锁实现克服了基础实现中锁的竞争带来的性能问题，所以必然在吞吐量测试中会有更好的结果，下面是基础实现和无锁实现的测试结果对比。

| Benchmark                                                    | Capacity | Duration | Items Per Second | Bytes Per Second | Item Size | Iterations |
| ------------------------------------------------------------ | -------- | -------- | ---------------- | ---------------- | --------- | ---------- |
| `BM_MutexQueueThroughput/capacity:1024/duration_seconds:10/iterations:1/manual_time` | 1024     | 10 s     | 11.2531M/s       | 42.9272 Mi/s     | 4 bytes   | 1          |
| `BM_MutexQueueThroughput/capacity:65536/duration_seconds:10/iterations:1/manual_time` | 65536    | 10 s     | 12.8805M/s       | 49.1351 Mi/s     | 4 bytes   | 1          |
| `BM_RingBufferThroughput/capacity:1024/duration_seconds:10/iterations:1/manual_time` | 1024     | 10 s     | 28.134M/s        | 107.323 Mi/s     | 4 bytes   | 1          |
| `BM_RingBufferThroughput/capacity:65536/duration_seconds:10/iterations:1/manual_time` | 65536    | 10 s     | 39.3375M/s       | 150.061 Mi/s     | 4 bytes   | 1          |

| Capacity | MutexQueue Items/s | RingBuffer Items/s | RingBuffer Speedup | RingBuffer Throughput Gain |
| -------- | ------------------ | ------------------ | ------------------ | -------------------------- |
| 1024     | 11.2531M/s         | 28.134M/s          | 2.500x             | +150.0%                    |
| 65536    | 12.8805M/s         | 39.3375M/s         | 3.054x             | +205.4%                    |

可见，无锁实现相对于上面普通的队列，在单生产者-单消费者的场景下性能有显著的提升。

## 互斥慢在哪里

第一种基础实现的队列，在生产者和消费者进行读写操作的时候，不可避免的会产生锁竞争，锁竞争会带来一系列代价昂贵的后续问题。例如，当生产者线程要向队列中推送数据的时候，它会上锁，而此时期望从队列中获取数据的消费者线程则会等待，这个过程还会产生线程上下文切换，线程上下文切换可能还会带来缓存失效等进一步的问题。这些问题共同导致了在大多数的场景里，无锁数据结构的性能都会更好一些。