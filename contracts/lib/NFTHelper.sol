// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165CheckerUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/interfaces/IERC2981Upgradeable.sol";

library NFTHelper {
    enum Type {
        ERC721,
        ERC1155,
        NONE
    }

    /**
     *  @notice Check ERC721 contract without error when not support function supportsInterface
     */
    function isERC721(address _account) internal view returns (bool) {
        return ERC165CheckerUpgradeable.supportsInterface(_account, type(IERC721Upgradeable).interfaceId);
    }

    /**
     *  @notice Check ERC1155 contract without error when not support function supportsInterface
     */
    function isERC1155(address _account) internal view returns (bool) {
        return ERC165CheckerUpgradeable.supportsInterface(_account, type(IERC1155Upgradeable).interfaceId);
    }

    /**
     *  @notice Check royalty without error when not support function supportsInterface
     */
    function isRoyalty(address _account) internal view returns (bool) {
        return ERC165CheckerUpgradeable.supportsInterface(_account, type(IERC2981Upgradeable).interfaceId);
    }

    /**
     *  @notice Check standard of nft contract address
     */
    function getType(address _account) internal view returns (Type) {
        if (isERC721(_account)) return Type.ERC721;
        if (isERC1155(_account)) return Type.ERC1155;

        return Type.NONE;
    }

    /**
     *  @notice Transfer nft call
     */
    function transferNFTCall(
        address nftContractAddress,
        uint256 tokenId,
        uint256 amount,
        address from,
        address to
    ) internal {
        NFTHelper.Type nftType = getType(nftContractAddress);
        require(nftType != NFTHelper.Type.NONE, "ERROR: NFT address is incompatible!");

        if (nftType == NFTHelper.Type.ERC721) {
            IERC721Upgradeable(nftContractAddress).safeTransferFrom(from, to, tokenId);
        } else {
            IERC1155Upgradeable(nftContractAddress).safeTransferFrom(from, to, tokenId, amount, "");
        }
    }
}
