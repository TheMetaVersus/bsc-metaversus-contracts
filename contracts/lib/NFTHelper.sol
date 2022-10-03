// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165CheckerUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155Upgradeable.sol";

library NFTHelper {
    enum Type {
        ERC721,
        ERC1155,
        NONE
    }

    /**
     *  @notice Check standard of nft contract address
     */
    function getType(address _account) external view returns (Type) {
        if (ERC165CheckerUpgradeable.supportsInterface(_account, type(IERC721Upgradeable).interfaceId))
            return Type.ERC721;
        if (ERC165CheckerUpgradeable.supportsInterface(_account, type(IERC1155Upgradeable).interfaceId))
            return Type.ERC1155;

        return Type.NONE;
    }
}
