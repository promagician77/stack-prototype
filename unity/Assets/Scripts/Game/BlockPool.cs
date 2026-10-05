using UnityEngine;
using UnityEngine.Pool;

namespace StackDrop.Game
{
    /// <summary>
    /// Falling slices and particles are pooled. Instantiate/Destroy per drop causes GC spikes
    /// that show up as stutter on low-end Android, exactly when a perfect drop should feel smooth.
    /// </summary>
    public sealed class BlockPool : MonoBehaviour
    {
        [SerializeField] Block prefab;
        [SerializeField] int warmUp = 32;
        ObjectPool<Block> _pool;

        public int CountActive => _pool.CountActive;
        public int CountInactive => _pool.CountInactive;

        void Awake()
        {
            _pool = new ObjectPool<Block>(
                createFunc: () => Instantiate(prefab, transform),
                actionOnGet: b => b.gameObject.SetActive(true),
                actionOnRelease: b => b.gameObject.SetActive(false),
                actionOnDestroy: b => Destroy(b.gameObject),
                collectionCheck: false, defaultCapacity: warmUp, maxSize: 256);

            var warm = new Block[warmUp];
            for (int i = 0; i < warmUp; i++) warm[i] = _pool.Get();
            for (int i = 0; i < warmUp; i++) _pool.Release(warm[i]);
        }

        public Block Get() => _pool.Get();
        public void Release(Block b) => _pool.Release(b);
    }
}
