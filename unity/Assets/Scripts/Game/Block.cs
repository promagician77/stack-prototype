using UnityEngine;

namespace StackDrop.Game
{
    /// <summary>A pooled cube. Kinematic while part of the tower; physics only once it falls.</summary>
    [RequireComponent(typeof(Rigidbody))]
    public sealed class Block : MonoBehaviour
    {
        [SerializeField] Renderer meshRenderer;
        Rigidbody _body;

        public Renderer Renderer => meshRenderer;

        void Awake() => _body = GetComponent<Rigidbody>();

        void OnEnable()
        {
            _body.isKinematic = true;
            transform.rotation = Quaternion.identity;
        }

        public void Fall() => _body.isKinematic = false;
    }
}
